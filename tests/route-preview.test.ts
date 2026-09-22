import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { routePreviewData } from '../miniprogram/data/route-preview'
import type { BusRoute, BusStop, CandidateCoordinate, Coordinate } from '../miniprogram/models/index'
import { createEmptyRoutePreviewCache, generateRoutePreview } from '../miniprogram/services/map/route-preview-generator.service'
import type { MapProvider } from '../miniprogram/services/map/map-provider'
import type { RoutePreviewData, RoutePreviewSegment } from '../miniprogram/services/map/route-preview.types'
import { createRoutePreviewRepository } from '../miniprogram/services/repository/route-preview.repository'
import { createStaticRouteRepository } from '../miniprogram/services/repository/route.repository'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { routeRepository } from '../miniprogram/services/repository/route.repository'
import { syncRoutePreviewAdapter } from '../scripts/route-preview-data'

const points: Record<string, Coordinate> = {
  a: { latitude: 29.81, longitude: 106.41 },
  b: { latitude: 29.82, longitude: 106.42 },
  c: { latitude: 29.83, longitude: 106.43 },
  d: { latitude: 29.84, longitude: 106.44 },
}
const route: BusRoute = {
  id: 'route_test', name: '测试线路', serviceType: 'flexible_campus_bus', allowIntermediateStop: true,
  dataStatus: 'needs_review', directions: [{ name: 'forward', isLoop: false, stopIds: ['a', 'b', 'c', 'd'] }],
}
const stops: BusStop[] = Object.keys(points).map((id) => ({ id, name: id, aliases: [], coordinate: null }))

function candidate(point: Coordinate): CandidateCoordinate {
  return { coordinate: point, source: 'tencent', confidence: 0.99, verified: false }
}

function mockProvider(overrides: Partial<Pick<MapProvider, 'geocode' | 'drivingRoute'>> = {}) {
  const calls = { geocodes: 0, driving: 0 }
  const provider: Pick<MapProvider, 'geocode' | 'drivingRoute'> = {
    async geocode(query) {
      calls.geocodes += 1
      const point = points[query.slice(-1)]
      return point ? [candidate(point)] : []
    },
    async drivingRoute(origin, destination) {
      calls.driving += 1
      return { distanceMeters: 100, durationSeconds: 60, polyline: [origin, origin, destination] }
    },
    ...overrides,
  }
  return { calls, provider }
}

test('preview uses real provider segments, removes adjacent duplicate points, never approves or mutates formal data', async () => {
  const before = JSON.stringify({ route, stops })
  const mock = mockProvider()
  const result = await generateRoutePreview([route], stops, mock.provider)
  assert.equal(result.segments.length, 3)
  assert.equal(mock.calls.driving, 3)
  assert.ok(result.segments.every((segment) => segment.dataStatus === 'needs_review' && segment.points.length === 2))
  assert.ok(result.candidates.every((value) => value.candidate?.verified === false))
  assert.equal(JSON.stringify({ route, stops }), before)
  assert.equal(createStaticBusStopRepository(stops).getVerifiedStops().length, 0)
})

test('preview cache hit reuses ordered segments without provider requests, reverse direction has separate cache entries', async () => {
  const mock = mockProvider()
  const cache = createEmptyRoutePreviewCache()
  await generateRoutePreview([route], stops, mock.provider, cache)
  const second = await generateRoutePreview([route], stops, mock.provider, cache)
  assert.equal(second.segments.length, 3)
  assert.deepEqual(mock.calls, { geocodes: 4, driving: 3 })
  await generateRoutePreview([{ ...route, directions: [{ ...route.directions[0]!, name: 'reverse', stopIds: ['d', 'c', 'b', 'a'] }] }], stops, mock.provider, cache)
  assert.deepEqual(mock.calls, { geocodes: 4, driving: 6 })
})

test('missing or invalid middle candidate never fabricates a bridge; unaffected segments remain usable for preview', async () => {
  for (const invalid of [undefined, { latitude: 0, longitude: 0 }, { latitude: Number.NaN, longitude: 106.42 }]) {
    const mock = mockProvider({ async geocode(query) {
      const point = query.endsWith('b') ? invalid : points[query.slice(-1)]
      return point ? [candidate(point)] : []
    } })
    const result = await generateRoutePreview([route], stops, mock.provider)
    assert.deepEqual(result.segments.map(({ fromStopId, toStopId }) => [fromStopId, toStopId]), [['c', 'd']])
    assert.equal(mock.calls.driving, 1)
    assert.ok(result.warnings.some((message) => message.startsWith('Missing usable candidate')))
  }
})

test('duplicate campus-centre geocoding fallback is flagged and not routed', async () => {
  const mock = mockProvider({ async geocode() { return [candidate(points.a!)] } })
  const result = await generateRoutePreview([route], stops, mock.provider)
  assert.equal(result.segments.length, 0)
  assert.equal(mock.calls.driving, 0)
  assert.ok(result.candidates.every(({ usableForPreview, warnings }) => !usableForPreview && warnings.some((message) => message.includes('Duplicate coordinate'))))
})

test('invalid road polyline is excluded and external errors are sanitized', async () => {
  const mock = mockProvider({ async drivingRoute() {
    throw Object.assign(new Error('SECRET_URL_OR_KEY_MUST_NOT_LEAK'), { code: 'API_ERROR' })
  } })
  const failed = await generateRoutePreview([route], stops, mock.provider)
  assert.equal(failed.segments.length, 0)
  assert.ok(!JSON.stringify(failed).includes('SECRET_URL'))
  assert.ok(failed.warnings.some((message) => message.includes('API_ERROR')))
  const invalid = mockProvider({ async drivingRoute() {
    return { distanceMeters: 1, durationSeconds: 1, polyline: [points.a!, { latitude: 91, longitude: 106 }] }
  } })
  assert.equal((await generateRoutePreview([route], stops, invalid.provider)).segments.length, 0)
})

test('preview repository filters unknown route/direction, non-adjacent gaps, invalid coordinates and inappropriate status', async () => {
  const segment: RoutePreviewSegment = {
    routeId: route.id, directionId: 'forward', fromStopId: 'a', toStopId: 'b', points: [points.a!, points.b!],
    source: 'tencent_driving', dataStatus: 'needs_review',
  }
  const data: RoutePreviewData = { generatedAt: null, candidates: [], warnings: [], segments: [
    segment,
    { ...segment, routeId: 'missing' },
    { ...segment, directionId: 'missing' },
    { ...segment, fromStopId: 'a', toStopId: 'd' },
    { ...segment, points: [points.a!, { latitude: Number.NaN, longitude: 0 }] },
    { ...segment, dataStatus: 'verified' } as unknown as RoutePreviewSegment,
  ] }
  const repository = createRoutePreviewRepository(data, createStaticRouteRepository([route]))
  assert.equal(repository.getAll().length, 1)
  assert.equal(repository.getSegments(route.id, 'forward').length, 1)
  assert.equal(repository.getSegments(route.id, 'reverse').length, 0)
  assert.equal(repository.getSummary().warnings.length, 5)
  repository.getAll()[0]!.points[0]!.latitude = 0
  assert.equal(repository.getAll()[0]!.points[0]!.latitude, points.a!.latitude)
})

test('committed preview JSON and runtime adapter agree; every segment references an existing adjacent route pair', async () => {
  const json: unknown = JSON.parse(await readFile(new URL('../miniprogram/data/route-preview.json', import.meta.url), 'utf8'))
  assert.deepEqual(json, routePreviewData)
  await syncRoutePreviewAdapter(true)
  const repository = createRoutePreviewRepository(routePreviewData, routeRepository)
  assert.equal(repository.getAll().length, routePreviewData.segments.length)
  assert.ok(routePreviewData.candidates.every(({ candidate }) => candidate === null || candidate.verified === false))
  assert.ok(routePreviewData.segments.every(({ dataStatus }) => dataStatus === 'needs_review'))
})
