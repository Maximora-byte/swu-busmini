import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Coordinate } from '../miniprogram/models/index'
import type { TransitDataset, TransitStop, TransitVisit } from '../miniprogram/models/current-transit'
import { distanceBetween } from '../miniprogram/utils/distance'
import { MAX_AUTOMATIC_BOARDING_OFFSET_METERS } from '../miniprogram/services/navigation/transit-visit-policy'

export interface CurrentTransitSource {
  source: string
  observedAt: string
  routes: {
    id: string
    name: string
    color: string
    stations: { name: string; coordinate: Coordinate }[]
    points: Coordinate[]
  }[]
}

const ROUTES = [
  ['route_1', '1号线'], ['route_2', '2号线'], ['route_3', '3号线'], ['route_3b', '3路B线'],
  ['route_4', '4号线'], ['route_5', '5号线'], ['route_6', '6号线'], ['route_7', '7号线'],
  ['route_8', '8号线'], ['route_jingguan', '经管专线'],
] as const
const defaultDirectory = fileURLToPath(new URL('../miniprogram/data/', import.meta.url))

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid current transit record')
  return value as Record<string, unknown>
}

function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unapproved current transit field')
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Invalid current transit text')
  return value
}

function date(value: unknown): string {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 10) !== result) throw new Error('Invalid transit observedAt date')
  return result
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid current transit array')
  return value
}

function coordinate(value: unknown): Coordinate {
  const item = record(value)
  keys(item, ['latitude', 'longitude'])
  const { latitude, longitude } = item
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < 29.80 || latitude > 29.85 ||
    typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < 106.40 || longitude > 106.45) {
    throw new Error('Current transit coordinate outside Beibei bounds / 北碚范围')
  }
  return { latitude, longitude }
}

function numeric(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim().length === 0)) throw new Error('Invalid published coordinate')
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error('Invalid published coordinate')
  return result
}

/** Pair source identities before removing them; no account, provider identity or opaque fields are published. */
export function sanitizeCurrentTransitSource(stationInput: unknown, geometryInput: unknown): CurrentTransitSource {
  const stationData = record(stationInput)
  const geometryData = record(geometryInput)
  const observedAt = date(stationData.observedAt)
  if (geometryData.observedAt !== undefined && date(geometryData.observedAt) !== observedAt) throw new Error('Transit snapshot dates do not match')
  const stationRoutes = array(stationData.routes).map(record)
  const geometryRoutes = array(geometryData.routes).map(record)
  if (stationRoutes.length !== ROUTES.length || geometryRoutes.length !== ROUTES.length) throw new Error('Expected ten complete published transit lines')
  const stationIds = new Set(stationRoutes.map((route) => text(route.id)))
  const geometryIds = new Set(geometryRoutes.map((route) => text(route.line_id)))
  if (stationIds.size !== ROUTES.length || geometryIds.size !== ROUTES.length ||
    [...stationIds].some((id) => !geometryIds.has(id))) throw new Error('Transit line identity 关联/匹配 mismatch or duplicate')
  if (new Set(stationRoutes.map((route) => route.name)).size !== ROUTES.length) throw new Error('Duplicate transit route names')
  const routes = ROUTES.map(([id, name]) => {
    const station = stationRoutes.find((route) => route.name === name)
    if (!station) throw new Error('Missing or unknown published route name')
    const geometry = geometryRoutes.find((route) => route.line_id === station.id)
    if (!geometry || geometry.name !== station.name) throw new Error('Transit geometry identity 关联/匹配 mismatch')
    const color = text(geometry.color)
    if (!/^[0-9a-fA-F]{6}$/.test(color)) throw new Error('Invalid published route color')
    return {
      id, name, color: `#${color.toLowerCase()}`,
      stations: array(station.points).map((point) => {
        const node = record(point)
        return { name: text(node.name), coordinate: coordinate({ latitude: numeric(node.lat), longitude: numeric(node.lng) }) }
      }),
      points: array(geometry.points).map((point) => {
        const parts = text(point).split(',')
        if (parts.length !== 2) throw new Error('Invalid published geometry point')
        return coordinate({ latitude: numeric(parts[0]), longitude: numeric(parts[1]) })
      }),
    }
  })
  const source = { source: '享坐车 · 西南大学地图首页', observedAt, routes }
  // Bounds and geometry quality are checked before a sanitized artifact can be written.
  buildCurrentTransitDataset(source)
  return source
}

function parseSource(value: unknown): CurrentTransitSource {
  const item = record(value)
  keys(item, ['source', 'observedAt', 'routes'])
  const ids = new Set<string>()
  const routes = array(item.routes).map((input) => {
    const route = record(input)
    keys(route, ['id', 'name', 'color', 'stations', 'points'])
    const id = text(route.id)
    const name = text(route.name)
    if (!ROUTES.some(([knownId, knownName]) => id === knownId && name === knownName)) throw new Error('Unknown current route identity')
    if (ids.has(id)) throw new Error('Duplicate current route id')
    ids.add(id)
    const color = text(route.color)
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Invalid current route color')
    const points = array(route.points).map(coordinate)
    const stations = array(route.stations).map((input) => {
      const station = record(input)
      keys(station, ['name', 'coordinate'])
      return { name: text(station.name), coordinate: coordinate(station.coordinate) }
    })
    if (points.length < 2 || stations.length < 2) throw new Error('Current route needs geometry and at least two station nodes')
    return { id, name, color, stations, points }
  })
  if (!routes.length) throw new Error('Current source has no routes')
  return { source: text(item.source), observedAt: date(item.observedAt), routes }
}

type Projection = Omit<TransitVisit, 'stopId' | 'sourceIndex'>

function nearestProjection(
  point: Coordinate,
  points: Coordinate[],
  cumulative: number[],
  accept: (projection: Projection) => boolean = () => true,
): Projection | undefined {
  let best: Projection | undefined
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
    const start = points[segmentIndex]
    const end = points[segmentIndex + 1]
    const length = cumulative[segmentIndex + 1] - cumulative[segmentIndex]
    if (length === 0) continue
    const cosine = Math.cos((start.latitude + end.latitude + point.latitude) / 3 * Math.PI / 180)
    const dx = (end.longitude - start.longitude) * cosine
    const dy = end.latitude - start.latitude
    const px = (point.longitude - start.longitude) * cosine
    const py = point.latitude - start.latitude
    const ratio = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
    const projected = { latitude: start.latitude + ratio * dy, longitude: start.longitude + ratio * (end.longitude - start.longitude) }
    const offsetMeters = distanceBetween(point, projected)
    const candidate = { segmentIndex, ratio, mileageMeters: cumulative[segmentIndex] + length * ratio, offsetMeters }
    if (!accept(candidate)) continue
    if (!best || offsetMeters < best.offsetMeters - 1e-9) {
      best = candidate
    }
  }
  return best
}

function project(point: Coordinate, points: Coordinate[], cumulative: number[]): Projection {
  const best = nearestProjection(point, points, cumulative)
  if (!best) throw new Error('Current geometry has zero length / 长度为零')
  if (best.offsetMeters > 150) throw new Error('Station offset 偏离 published route exceeds 150 meters')
  return best
}

export interface PublishedRouteReturn extends Projection {
  remainingMeters: number
}

/** Mathematical near-return only: no cyclic service, extra edge, direction or coordinate is inferred. */
export function analyzePublishedRouteReturn(points: Coordinate[]): PublishedRouteReturn | undefined {
  if (points.length < 3) return undefined
  const cumulative = [0]
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + distanceBetween(points[index - 1], points[index]))
  }
  const totalMeters = cumulative[cumulative.length - 1]
  const projection = nearestProjection(points[points.length - 1], points, cumulative, (candidate) =>
    candidate.segmentIndex < points.length - 2 &&
    candidate.mileageMeters > 0 && totalMeters - candidate.mileageMeters >= 200)
  if (!projection || projection.offsetMeters > 2) return undefined
  return { ...projection, remainingMeters: totalMeters - projection.mileageMeters }
}

/** Deterministic, development-only projection and identity generation from the public static allowlist. */
export function buildCurrentTransitDataset(input: unknown): TransitDataset {
  const source = parseSource(input)
  const stops = new Map<string, TransitStop>()
  const routes = source.routes.map((route) => {
    const cumulative = [0]
    for (let i = 1; i < route.points.length; i++) cumulative.push(cumulative[i - 1] + distanceBetween(route.points[i - 1], route.points[i]))
    const visits = route.stations.map((station, sourceIndex): TransitVisit => {
      const rounded = {
        latitude: Number(station.coordinate.latitude.toFixed(6)),
        longitude: Number(station.coordinate.longitude.toFixed(6)),
      }
      const key = JSON.stringify([station.name, rounded.latitude.toFixed(6), rounded.longitude.toFixed(6)])
      const stopId = `stop_${createHash('sha256').update(key).digest('hex').slice(0, 16)}`
      const previous = stops.get(stopId)
      if (previous && (previous.name !== station.name || previous.coordinate.latitude !== rounded.latitude || previous.coordinate.longitude !== rounded.longitude)) {
        throw new Error('Current station identity collision')
      }
      stops.set(stopId, { id: stopId, name: station.name, coordinate: rounded })
      return { stopId, sourceIndex, ...project(rounded, route.points, cumulative) }
    }).sort((left, right) => left.mileageMeters - right.mileageMeters || left.sourceIndex - right.sourceIndex)
    const warnings = visits.filter((visit) => visit.offsetMeters > MAX_AUTOMATIC_BOARDING_OFFSET_METERS).map((visit) =>
      `「${stops.get(visit.stopId)!.name}」偏离发布轨迹约 ${Math.round(visit.offsetMeters)} 米（超过${MAX_AUTOMATIC_BOARDING_OFFSET_METERS}米），位置待核对，暂不作为本线路自动上下车/换乘点；未判定实际停靠情况。`)
    if (analyzePublishedRouteReturn(route.points)) {
      warnings.push('发布轨迹末点在2米以内接近早期中段（中段近回接），呈引入段+近闭环图形；循环运营未确认，不补边。')
    }
    return { id: route.id, name: route.name, color: route.color, points: route.points, visits, warnings }
  })
  return {
    id: `swu-operator-${source.observedAt}`, source: source.source, observedAt: source.observedAt,
    coordinateSystem: 'GCJ-02', quality: 'operator_published', stops: [...stops.values()], routes,
  }
}

export function serializeCurrentTransitAdapter(dataset: TransitDataset): string {
  return `import type { TransitDataset } from '../models/current-transit'\n\n/** Generated from sanitized operator-published static data. Not an on-site verification. */\nexport const currentTransitDataset: TransitDataset = ${JSON.stringify(dataset, null, 2)}\n`
}

async function existing(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8') } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    return undefined
  }
}

/** Rebuild both mirrors from the sanitized source. Check mode is strictly read-only. */
export async function syncCurrentTransitData(directory = defaultDirectory, checkOnly = false): Promise<void> {
  const source: unknown = JSON.parse(await readFile(join(directory, 'current-transit-source.json'), 'utf8'))
  const dataset = buildCurrentTransitDataset(source)
  const outputs = [
    ['current-transit.json', `${JSON.stringify(dataset, null, 2)}\n`],
    ['current-transit.ts', serializeCurrentTransitAdapter(dataset)],
  ]
  const stale = []
  for (const [file, content] of outputs) {
    if ((await existing(join(directory, file)))?.replace(/\r\n/g, '\n') !== content) stale.push({ file, content })
  }
  if (checkOnly && stale.length) throw new Error('Current transit data not in sync / 未同步；运行 npm run sync:data')
  for (const { file, content } of stale) await writeFile(join(directory, file), content, 'utf8')
}

export async function importCurrentTransitData(stations: unknown, geometry: unknown, directory = defaultDirectory): Promise<void> {
  const source = sanitizeCurrentTransitSource(stations, geometry)
  await writeFile(join(directory, 'current-transit-source.json'), `${JSON.stringify(source, null, 2)}\n`, 'utf8')
  await syncCurrentTransitData(directory)
}
