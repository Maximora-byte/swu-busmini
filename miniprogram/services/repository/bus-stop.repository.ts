import stopsData from '../../data/stops.json'
import type { BusStop, Coordinate } from '../../models/index'

type CoordinateStatus = BusStop['coordinateStatus']

interface StaticBusStopRecord {
  id: string
  name: string
  aliases: string[]
  latitude: number | null
  longitude: number | null
  coordinateStatus: CoordinateStatus
  coordinateTodo?: string
}

export interface BusStopRepository {
  getAll(): readonly BusStop[]
  findById(id: string): BusStop | undefined
  getByIds(ids: readonly string[]): readonly BusStop[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function parseCoordinate(record: StaticBusStopRecord): Coordinate | null {
  if (record.latitude === null && record.longitude === null) {
    if (record.coordinateStatus !== 'pending') {
      throw new Error(`站点 ${record.id} 缺少坐标，但未标记为 pending`)
    }
    return null
  }

  if (record.latitude === null || record.longitude === null) {
    throw new Error(`站点 ${record.id} 的经纬度必须同时填写或同时为空`)
  }

  if (
    record.latitude < -90 ||
    record.latitude > 90 ||
    record.longitude < -180 ||
    record.longitude > 180
  ) {
    throw new Error(`站点 ${record.id} 的经纬度超出有效范围`)
  }

  if (record.coordinateStatus !== 'verified') {
    throw new Error(`站点 ${record.id} 已填写坐标，但尚未标记为 verified`)
  }

  return {
    latitude: record.latitude,
    longitude: record.longitude,
  }
}

function parseRecord(value: unknown, index: number): StaticBusStopRecord {
  if (!isRecord(value)) {
    throw new Error(`stops.json 第 ${index + 1} 项不是对象`)
  }

  const { id, name, aliases, latitude, longitude, coordinateStatus } = value
  const coordinateTodo = value.coordinateTodo

  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    !isStringArray(aliases) ||
    !isNullableNumber(latitude) ||
    !isNullableNumber(longitude) ||
    (coordinateStatus !== 'verified' && coordinateStatus !== 'pending') ||
    (coordinateTodo !== undefined && typeof coordinateTodo !== 'string')
  ) {
    throw new Error(`stops.json 第 ${index + 1} 项结构无效`)
  }

  return {
    id,
    name,
    aliases,
    latitude,
    longitude,
    coordinateStatus,
    coordinateTodo,
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
      coordinate: parseCoordinate(record),
      coordinateStatus: record.coordinateStatus,
      coordinateTodo: record.coordinateTodo,
    }
  })
}

export function createStaticBusStopRepository(
  data: unknown,
): BusStopRepository {
  const stops = parseStops(data)
  const stopsById = new Map(stops.map((stop) => [stop.id, stop]))

  return {
    getAll: () => stops,
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
