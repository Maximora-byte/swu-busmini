import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { CandidateCoordinate, Coordinate, DrivingRouteResult } from '../miniprogram/models/index'
import { createEmptyRoutePreviewCache, generateRoutePreview, type RoutePreviewCache } from '../miniprogram/services/map/route-preview-generator.service'
import { TencentMapProvider, type TencentRequestClient } from '../miniprogram/services/map/tencent/tencent-map.provider'
import { busStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { routeRepository } from '../miniprogram/services/repository/route.repository'
import { writeRoutePreviewData } from './route-preview-data'

const cachePath = fileURLToPath(new URL('../.cache/route-preview-cache.json', import.meta.url))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCoordinate(value: unknown): value is Coordinate {
  return isRecord(value) && typeof value.latitude === 'number' && Number.isFinite(value.latitude) &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude)
}

function isCandidate(value: unknown): value is CandidateCoordinate {
  return isRecord(value) && isCoordinate(value.coordinate) && value.source === 'tencent' &&
    value.verified === false && typeof value.confidence === 'number' && Number.isFinite(value.confidence)
}

function isDrivingResult(value: unknown): value is DrivingRouteResult {
  return isRecord(value) && typeof value.distanceMeters === 'number' && Number.isFinite(value.distanceMeters) &&
    typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) &&
    Array.isArray(value.polyline) && value.polyline.every(isCoordinate)
}

async function readCache(): Promise<RoutePreviewCache> {
  const cache = createEmptyRoutePreviewCache()
  try {
    const value: unknown = JSON.parse(await readFile(cachePath, 'utf8'))
    if (!isRecord(value) || !isRecord(value.geocodes) || !isRecord(value.driving)) return cache
    for (const [query, candidates] of Object.entries(value.geocodes)) {
      if (Array.isArray(candidates) && candidates.every(isCandidate)) cache.geocodes[query] = candidates
    }
    for (const [key, result] of Object.entries(value.driving)) {
      if (isDrivingResult(result)) cache.driving[key] = result
    }
  } catch {
    // A missing or damaged development cache never affects production data.
  }
  return cache
}

async function loadKey(): Promise<string> {
  const moduleUrl = new URL('../miniprogram/config/config.local.ts', import.meta.url)
  let loaded: unknown
  try { loaded = await import(moduleUrl.href) } catch { throw new Error('LOCAL_CONFIG_MISSING') }
  if (!isRecord(loaded) || !isRecord(loaded.config) || typeof loaded.config.tencentMapKey !== 'string' || !loaded.config.tencentMapKey.trim()) {
    throw new Error('LOCAL_CONFIG_INVALID')
  }
  return loaded.config.tencentMapKey.trim()
}

function createBoundedClient(maxRequests: number): { client: TencentRequestClient; count: () => number } {
  let requests = 0
  return {
    count: () => requests,
    client: {
      async get(endpoint, parameters) {
        if (requests >= maxRequests) throw Object.assign(new Error('REQUEST_LIMIT'), { code: 'REQUEST_LIMIT' })
        requests += 1
        if (requests > 1) await new Promise<void>((resolve) => setTimeout(resolve, 400))
        const url = new URL(endpoint)
        for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value))
        // Keep request URLs entirely in memory; never log or serialize keys/errors.
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error('HTTP_REQUEST_FAILED')
        return response.json()
      },
    },
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const limitArg = args.find((arg) => arg.startsWith('--max-requests='))
  const maxRequests = limitArg ? Number(limitArg.split('=')[1]) : 80
  if (!Number.isInteger(maxRequests) || maxRequests < 0 || maxRequests > 120) throw new Error('INVALID_REQUEST_LIMIT')
  const ids = args.filter((arg) => !arg.startsWith('--'))
  if (args.some((arg) => arg.startsWith('--') && arg !== limitArg)) throw new Error('UNKNOWN_OPTION')
  const routes = ids.length === 0 ? routeRepository.getAll() : [...new Set(ids)].map((id) => {
    const route = routeRepository.findById(id)
    if (!route) throw new Error('UNKNOWN_ROUTE')
    return route
  })
  const key = await loadKey()
  const bounded = createBoundedClient(maxRequests)
  const provider = new TencentMapProvider({ key, requestClient: bounded.client, region: '重庆市' })
  const cache = await readCache()
  try {
    const result = await generateRoutePreview(routes, busStopRepository.getAll(), provider, cache)
    // Separate output: never write stops/routes/coordinate-reviews/route-geometries.
    await writeRoutePreviewData(result)
    console.log(JSON.stringify({
      routes: routes.map(({ id }) => id),
      requests: bounded.count(),
      candidates: result.candidates.filter(({ candidate }) => candidate !== null).length,
      usableCandidates: result.candidates.filter(({ usableForPreview }) => usableForPreview).length,
      previewSegments: result.segments.length,
      warnings: result.warnings,
    }, null, 2))
    console.log('仅生成未审核实验预览；未修改正式站点或轨迹。道路推荐不等于实际校车路径。')
  } finally {
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  }
}

main().catch((error: unknown) => {
  const safeCodes = ['LOCAL_CONFIG_MISSING', 'LOCAL_CONFIG_INVALID', 'INVALID_REQUEST_LIMIT', 'UNKNOWN_OPTION', 'UNKNOWN_ROUTE']
  const code = error instanceof Error && safeCodes.includes(error.message) ? error.message : 'PREVIEW_GENERATION_FAILED'
  console.error(`实验预览失败: ${code}。用法: npm run generate:preview [route_1 ...] [--max-requests=80]`)
  process.exitCode = 1
})
