import type { BusRoute, Coordinate, RouteGeometry } from '../../models/index'

export type RouteGeometryValidationIssueCode =
  | 'invalid_record'
  | 'duplicate_geometry'
  | 'unknown_route'
  | 'unknown_direction'
  | 'insufficient_points'
  | 'invalid_coordinate'
  | 'missing_verified_source'

export interface RouteGeometryValidationIssue {
  code: RouteGeometryValidationIssueCode
  index: number
  routeId?: string
  directionId?: string
  message: string
}

export interface RouteGeometryValidationResult {
  valid: boolean
  issues: readonly RouteGeometryValidationIssue[]
  geometries: readonly RouteGeometry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validCoordinate(value: unknown): value is Coordinate {
  if (!isRecord(value)) {
    return false
  }
  const { latitude, longitude } = value
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

export function validateRouteGeometryData(
  value: unknown,
  routes: readonly BusRoute[],
): RouteGeometryValidationResult {
  if (!Array.isArray(value)) {
    return {
      valid: false,
      issues: [
        {
          code: 'invalid_record',
          index: -1,
          message: 'route-geometries.json 根节点必须是数组',
        },
      ],
      geometries: [],
    }
  }

  const issues: RouteGeometryValidationIssue[] = []
  const geometries: RouteGeometry[] = []
  const keys = new Set<string>()

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push({
        code: 'invalid_record',
        index,
        message: `route-geometries.json 第 ${index + 1} 项不是对象`,
      })
      return
    }

    const { routeId, directionId, source, dataStatus, points } = item
    if (
      typeof routeId !== 'string' ||
      routeId.trim().length === 0 ||
      typeof directionId !== 'string' ||
      directionId.trim().length === 0 ||
      typeof source !== 'string' ||
      (dataStatus !== 'generated' &&
        dataStatus !== 'needs_review' &&
        dataStatus !== 'verified') ||
      !Array.isArray(points)
    ) {
      issues.push({
        code: 'invalid_record',
        index,
        message: `route-geometries.json 第 ${index + 1} 项结构无效`,
      })
      return
    }

    const details = { index, routeId, directionId }
    const route = routes.find(({ id }) => id === routeId)
    if (!route) {
      issues.push({
        ...details,
        code: 'unknown_route',
        message: `线路轨迹引用了不存在的线路: ${routeId}`,
      })
    } else if (!route.directions.some(({ name }) => name === directionId)) {
      issues.push({
        ...details,
        code: 'unknown_direction',
        message: `线路 ${routeId} 不存在方向: ${directionId}`,
      })
    }

    const key = `${routeId}\u0000${directionId}`
    if (keys.has(key)) {
      issues.push({
        ...details,
        code: 'duplicate_geometry',
        message: `线路 ${routeId} 方向 ${directionId} 存在重复轨迹`,
      })
    }
    keys.add(key)

    if (points.length < 2) {
      issues.push({
        ...details,
        code: 'insufficient_points',
        message: `线路 ${routeId} 方向 ${directionId} 的轨迹少于两个点`,
      })
    }
    if (!points.every(validCoordinate)) {
      issues.push({
        ...details,
        code: 'invalid_coordinate',
        message: `线路 ${routeId} 方向 ${directionId} 包含非法坐标`,
      })
    }
    if (dataStatus === 'verified' && source.trim().length === 0) {
      issues.push({
        ...details,
        code: 'missing_verified_source',
        message: `已验证轨迹 ${routeId}/${directionId} 必须注明来源`,
      })
    }

    if (points.every(validCoordinate)) {
      geometries.push({
        routeId,
        directionId,
        source,
        dataStatus,
        points: points.filter(validCoordinate).map((point) => ({ ...point })),
      })
    }
  })

  return { valid: issues.length === 0, issues, geometries }
}
