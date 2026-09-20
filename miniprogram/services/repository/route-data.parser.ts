import type {
  BusDirection,
  BusRoute,
  RouteDataStatus,
  RouteServiceType,
} from '../../models/index'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRouteServiceType(value: unknown): value is RouteServiceType {
  return value === 'fixed_stop' || value === 'flexible_campus_bus'
}

function isRouteDataStatus(value: unknown): value is RouteDataStatus {
  return value === 'needs_review' || value === 'verified'
}

function parseGeometry(
  value: unknown,
  routeId: string,
  directionName: string,
): BusDirection['geometry'] {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    throw new Error(`线路 ${routeId} 方向 ${directionName} 的 geometry 无效`)
  }

  return value.map((point) => {
    if (!isRecord(point)) {
      throw new Error(`线路 ${routeId} 方向 ${directionName} 包含无效轨迹点`)
    }
    const { latitude, longitude } = point
    if (
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(`线路 ${routeId} 方向 ${directionName} 包含无效轨迹点`)
    }
    return { latitude, longitude }
  })
}

function parseDirection(value: unknown, routeId: string): BusDirection {
  if (!isRecord(value)) {
    throw new Error(`线路 ${routeId} 包含无效方向`)
  }

  const { name, isLoop, stopIds } = value
  const allowedRepeatedStopIds = value.allowedRepeatedStopIds
  if (
    typeof name !== 'string' ||
    typeof isLoop !== 'boolean' ||
    !isStringArray(stopIds) ||
    (allowedRepeatedStopIds !== undefined &&
      !isStringArray(allowedRepeatedStopIds))
  ) {
    throw new Error(`线路 ${routeId} 的方向结构无效`)
  }

  if (
    allowedRepeatedStopIds &&
    new Set(allowedRepeatedStopIds).size !== allowedRepeatedStopIds.length
  ) {
    throw new Error(`线路 ${routeId} 方向 ${name} 的重复站点白名单包含重复项`)
  }

  const geometry = parseGeometry(value.geometry, routeId, name)

  return {
    name,
    isLoop,
    stopIds: [...stopIds],
    ...(geometry ? { geometry } : {}),
    allowedRepeatedStopIds: allowedRepeatedStopIds
      ? [...allowedRepeatedStopIds]
      : undefined,
  }
}

/** 只解析单条记录结构；跨记录唯一性由 Validator / Repository 负责。 */
export function parseRouteData(value: unknown): readonly BusRoute[] {
  if (!Array.isArray(value)) {
    throw new Error('routes.json 根节点必须是数组')
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`routes.json 第 ${index + 1} 项不是对象`)
    }

    const {
      id,
      name,
      serviceType,
      allowIntermediateStop,
      dataStatus,
      directions,
    } = item
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      !isRouteServiceType(serviceType) ||
      typeof allowIntermediateStop !== 'boolean' ||
      !isRouteDataStatus(dataStatus) ||
      !Array.isArray(directions)
    ) {
      throw new Error(`routes.json 第 ${index + 1} 项结构无效`)
    }

    const parsedDirections = directions.map((direction) =>
      parseDirection(direction, id),
    )
    const directionNames = new Set(parsedDirections.map(({ name }) => name))
    if (directionNames.size !== parsedDirections.length) {
      throw new Error(`线路 ${id} 存在重复方向名称`)
    }

    return {
      id,
      name,
      serviceType,
      allowIntermediateStop,
      dataStatus,
      directions: parsedDirections,
    }
  })
}
