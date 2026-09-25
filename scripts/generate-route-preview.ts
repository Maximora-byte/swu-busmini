import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { CandidateCoordinate, Coordinate, DrivingRouteResult } from '../miniprogram/models/index'
import { createEmptyRoutePreviewCache, generateRoutePreview, type RoutePreviewCache } from '../miniprogram/services/map/route-preview-generator.service'
import { TencentMapProvider, type TencentRequestClient, type TencentPlaceCandidate } from '../miniprogram/services/map/tencent/tencent-map.provider'
import { matchPreviewPlaces, PREVIEW_PLACE_NAMES } from '../miniprogram/services/map/preview-place-matching'
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

function isPlace(value: unknown): value is TencentPlaceCandidate {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string' &&
    typeof value.address === 'string' && isCoordinate(value.coordinate)
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
    if (isRecord(value.places)) {
      for (const [query, places] of Object.entries(value.places)) {
        if (Array.isArray(places) && places.every(isPlace)) (cache.places ??= {})[query] = places
      }
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
  // New acquisitions require POI title evidence by default. --places remains an explicit alias.
  const usePlaceSearch = true
  if (args.some((arg) => arg.startsWith('--') && arg !== limitArg && arg !== '--places' && arg !== '--inspect-places')) throw new Error('UNKNOWN_OPTION')
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
    if (args.includes('--inspect-places')) {
      const usedIds = new Set(routes.flatMap((route) => route.directions.flatMap((direction) => direction.stopIds)))
      for (const stop of busStopRepository.getAll().filter((stop) => usedIds.has(stop.id))) {
        const query = `西南大学${PREVIEW_PLACE_NAMES[stop.id] ?? stop.name}`
        const places = (cache.places ??= {})[query] ??= await provider.searchPlaces(query)
        console.log(JSON.stringify({ stopId: stop.id, query, matches: matchPreviewPlaces(stop, places), returnedTitles: places.map(({ title }) => title) }))
      }
      console.log(`检查完成：${bounded.count()} 次请求，仅更新本地缓存，未修改地图预览。`)
      return
    }
    const result = await generateRoutePreview(routes, busStopRepository.getAll(), provider, cache, undefined, { usePlaceSearch })
    // Transient API/network/quota errors must not replace the previous preview with a partial run.
    if (result.warnings.some((warning) => warning.includes(' failed'))) throw new Error('PREVIEW_GENERATION_FAILED')
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
  console.error(`实验预览失败: ${code}。原预览保留。用法: npm run generate:preview [route_1 ...] [--places|--inspect-places] [--max-requests=80]`)
  process.exitCode = 1
})
