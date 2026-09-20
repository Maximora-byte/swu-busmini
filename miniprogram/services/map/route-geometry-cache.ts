import type {
  Coordinate,
  RouteGeometryCacheEntry,
  RouteGeometryMode,
} from '../../models/index'

export interface RouteGeometryCache {
  get(
    mode: RouteGeometryMode,
    origin: Coordinate,
    destination: Coordinate,
  ): readonly Coordinate[] | undefined
  set(
    mode: RouteGeometryMode,
    origin: Coordinate,
    destination: Coordinate,
    points: readonly Coordinate[],
  ): void
  getEntries(): readonly RouteGeometryCacheEntry[]
}

function isCoordinate(value: unknown): value is Coordinate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  const { latitude, longitude } = record
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  )
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return { ...coordinate }
}

function cacheKey(
  mode: RouteGeometryMode,
  origin: Coordinate,
  destination: Coordinate,
): string {
  return [
    mode,
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  ].join(':')
}

function parseEntries(value: unknown): RouteGeometryCacheEntry[] {
  if (!Array.isArray(value)) {
    throw new Error('geometry-cache.json 根节点必须是数组')
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`geometry-cache.json 第 ${index + 1} 项不是对象`)
    }
    const record = entry as Record<string, unknown>
    const { mode, origin, destination, points } = record
    if (
      (mode !== 'walking' && mode !== 'driving') ||
      !isCoordinate(origin) ||
      !isCoordinate(destination) ||
      !Array.isArray(points) ||
      points.length < 2 ||
      !points.every(isCoordinate)
    ) {
      throw new Error(`geometry-cache.json 第 ${index + 1} 项结构无效`)
    }
    return {
      mode,
      origin: cloneCoordinate(origin),
      destination: cloneCoordinate(destination),
      points: points.map(cloneCoordinate),
    }
  })
}

export function createRouteGeometryCache(
  initialData: unknown = [],
): RouteGeometryCache {
  const entries = parseEntries(initialData)
  const entriesByKey = new Map(
    entries.map((entry) => [
      cacheKey(entry.mode, entry.origin, entry.destination),
      entry,
    ]),
  )

  return {
    get(mode, origin, destination) {
      const entry = entriesByKey.get(cacheKey(mode, origin, destination))
      return entry?.points.map(cloneCoordinate)
    },
    set(mode, origin, destination, points) {
      if (points.length < 2 || !points.every(isCoordinate)) {
        throw new Error('缓存线路分段必须包含至少两个合法坐标点')
      }
      const entry: RouteGeometryCacheEntry = {
        mode,
        origin: cloneCoordinate(origin),
        destination: cloneCoordinate(destination),
        points: points.map(cloneCoordinate),
      }
      entriesByKey.set(cacheKey(mode, origin, destination), entry)
    },
    getEntries: () =>
      [...entriesByKey.values()].map((entry) => ({
        ...entry,
        origin: cloneCoordinate(entry.origin),
        destination: cloneCoordinate(entry.destination),
        points: entry.points.map(cloneCoordinate),
      })),
  }
}
