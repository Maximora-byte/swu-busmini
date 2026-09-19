import stopsData from '../../data/stops.json'
import type {
  BusStop,
  BusStopCoordinate,
  VerifiedBusStop,
} from '../../models/index'

interface StaticBusStopRecord {
  id: string
  name: string
  aliases: string[]
  coordinate: BusStopCoordinate | null
  coordinateTodo?: string
  dataTodo?: string
}

export interface BusStopRepository {
  getAll(): readonly BusStop[]
  getVerifiedStops(): readonly VerifiedBusStop[]
  findById(id: string): BusStop | undefined
  getByIds(ids: readonly string[]): readonly BusStop[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseCoordinate(
  value: unknown,
  stopId: string,
): BusStopCoordinate | null {
  if (value === null) {
    return null
  }

  if (!isRecord(value)) {
    throw new Error(`站点 ${stopId} 的 coordinate 必须是对象或 null`)
  }

  const { latitude, longitude, verified } = value
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    typeof verified !== 'boolean'
  ) {
    throw new Error(`站点 ${stopId} 的坐标结构无效`)
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(`站点 ${stopId} 的经纬度超出有效范围`)
  }

  return { latitude, longitude, verified }
}

function parseRecord(value: unknown, index: number): StaticBusStopRecord {
  if (!isRecord(value)) {
    throw new Error(`stops.json 第 ${index + 1} 项不是对象`)
  }

  const { id, name, aliases, coordinate } = value
  const coordinateTodo = value.coordinateTodo
  const dataTodo = value.dataTodo

  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    !isStringArray(aliases) ||
    (coordinateTodo !== undefined && typeof coordinateTodo !== 'string') ||
    (dataTodo !== undefined && typeof dataTodo !== 'string')
  ) {
    throw new Error(`stops.json 第 ${index + 1} 项结构无效`)
  }

  return {
    id,
    name,
    aliases,
    coordinate: parseCoordinate(coordinate, id),
    coordinateTodo,
    dataTodo,
  }
}

function parseStops(value: unknown): readonly BusStop[] {
  if (!Array.isArray(value)) {
    throw new Error('stops.json 根节点必须是数组')
  }

  const ids = new Set<string>()
  return value.map((item, index) => {
    const record = parseRecord(item, index)
    if (ids.has(record.id)) {
      throw new Error(`stops.json 存在重复站点 id: ${record.id}`)
    }
    ids.add(record.id)

    return {
      id: record.id,
      name: record.name,
      aliases: [...record.aliases],
      coordinate: record.coordinate,
      coordinateTodo: record.coordinateTodo,
      dataTodo: record.dataTodo,
    }
  })
}

export function createStaticBusStopRepository(
  data: unknown,
): BusStopRepository {
  const stops = parseStops(data)
  const stopsById = new Map(stops.map((stop) => [stop.id, stop]))
  const verifiedStops = stops.filter(
    (stop): stop is VerifiedBusStop => stop.coordinate?.verified === true,
  )

  return {
    getAll: () => stops,
    getVerifiedStops: () => verifiedStops,
    findById: (id) => stopsById.get(id),
    getByIds: (ids) =>
      ids.map((id) => {
        const stop = stopsById.get(id)
        if (!stop) {
          throw new Error(`线路引用了不存在的站点: ${id}`)
        }
        return stop
      }),
  }
}

export const busStopRepository = createStaticBusStopRepository(stopsData)
