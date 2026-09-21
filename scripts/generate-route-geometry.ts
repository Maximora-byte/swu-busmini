import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import geometryCacheData from '../miniprogram/data/geometry-cache.json'
import { routeGeometries } from '../miniprogram/data/route-geometries'
import type { RouteGeometry } from '../miniprogram/models/index'
import { createRouteGeometryCache } from '../miniprogram/services/map/route-geometry-cache'
import { createRouteGeometryGeneratorService } from '../miniprogram/services/map/route-geometry-generator.service'
import {
  TencentMapProvider,
  type TencentRequestClient,
} from '../miniprogram/services/map/tencent/tencent-map.provider'
import { reviewedBusStopRepository } from '../miniprogram/services/repository/reviewed-bus-stop.repository'
import { createStaticRouteGeometryRepository } from '../miniprogram/services/repository/route-geometry.repository'
import { routeRepository } from '../miniprogram/services/repository/route.repository'
import { writeRouteGeometryData } from './route-geometry-data-writer'

interface LocalConfig {
  tencentMapKey: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function loadLocalConfig(): Promise<LocalConfig> {
  const moduleUrl = new URL(
    '../miniprogram/config/config.local.ts',
    import.meta.url,
  )
  let loadedModule: unknown
  try {
    loadedModule = await import(moduleUrl.href)
  } catch {
    throw new Error(
      '缺少 miniprogram/config/config.local.ts，请先从 config.example.ts 复制并填写腾讯地图 Key。',
    )
  }
  if (!isRecord(loadedModule) || !isRecord(loadedModule.config)) {
    throw new Error('config.local.ts 必须导出 config 对象')
  }
  const key = loadedModule.config.tencentMapKey
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('config.local.ts 中的 tencentMapKey 不能为空')
  }
  return { tencentMapKey: key.trim() }
}

function createNodeRequestClient(): TencentRequestClient {
  return {
    async get(endpoint, parameters) {
      const url = new URL(endpoint)
      for (const [name, value] of Object.entries(parameters)) {
        url.searchParams.set(name, String(value))
      }
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`腾讯位置服务 HTTP 请求失败: ${response.status}`)
      }
      return response.json()
    },
  }
}

const cachePath = fileURLToPath(
  new URL('../miniprogram/data/geometry-cache.json', import.meta.url),
)
async function main(): Promise<void> {
  const routeId = process.argv[2]?.trim() ?? ''
  if (routeId.length === 0) {
    throw new Error('用法: npm run generate:geometry route_1')
  }
  const route = routeRepository.findById(routeId)
  if (!route) {
    throw new Error(`未找到线路: ${routeId}`)
  }

  const current = createStaticRouteGeometryRepository(
    routeGeometries,
    routeRepository,
  ).getAll()
  const verifiedDirectionIds = new Set(
    current
      .filter(
        (geometry) =>
          geometry.routeId === routeId &&
          geometry.dataStatus === 'verified',
      )
      .map(({ directionId }) => directionId),
  )
  const directionsToGenerate = route.directions.filter(
    ({ name }) => !verifiedDirectionIds.has(name),
  )
  if (directionsToGenerate.length === 0) {
    console.log(`线路 ${route.name} 的全部方向均已有 verified 轨迹，未执行生成。`)
    return
  }

  const verifiedStopIds = new Set(
    reviewedBusStopRepository.getVerifiedStops().map(({ id }) => id),
  )
  const missingStopIds = [
    ...new Set(
      directionsToGenerate.flatMap(({ stopIds }) =>
        stopIds.filter((stopId) => !verifiedStopIds.has(stopId)),
      ),
    ),
  ]
  if (missingStopIds.length > 0) {
    throw new Error(`missing coordinate: ${missingStopIds.join(', ')}`)
  }

  const config = await loadLocalConfig()
  const cache = createRouteGeometryCache(geometryCacheData)
  const provider = new TencentMapProvider({
    key: config.tencentMapKey,
    requestClient: createNodeRequestClient(),
  })
  const generator = createRouteGeometryGeneratorService(
    provider,
    reviewedBusStopRepository,
    cache,
    { mode: 'driving', source: 'tencent_driving' },
  )

  try {
    const generated: RouteGeometry[] = []
    for (const direction of directionsToGenerate) {
      const geometry = await generator.generateDirection(route, direction)
      generated.push({ ...geometry, dataStatus: 'needs_review' })
    }
    const generatedDirectionIds = new Set(
      generated.map(({ directionId }) => directionId),
    )
    const retained = current.filter(
      (geometry) =>
        geometry.routeId !== routeId ||
        !generatedDirectionIds.has(geometry.directionId),
    )
    await writeRouteGeometryData([...retained, ...generated])
    console.log(JSON.stringify({ routeId, geometries: generated }, null, 2))
    console.log('生成结果已进入 needs_review，人工确认前不会进入地图展示。')
  } finally {
    await writeFile(
      cachePath,
      `${JSON.stringify(cache.getEntries(), null, 2)}\n`,
      'utf8',
    )
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '未知错误'
  console.error(`线路轨迹生成失败: ${message}`)
  process.exitCode = 1
})
