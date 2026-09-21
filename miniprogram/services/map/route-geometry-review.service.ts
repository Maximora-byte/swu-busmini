import type { RouteGeometry } from '../../models/index'
import type { RouteGeometryRepository } from '../repository/route-geometry.repository'

export interface RouteGeometryReviewService {
  getForReview(
    routeId?: string,
    directionId?: string,
  ): readonly RouteGeometry[]
  approve(
    geometries: readonly RouteGeometry[],
    routeId: string,
    directionId: string,
  ): readonly RouteGeometry[]
  reject(
    geometries: readonly RouteGeometry[],
    routeId: string,
    directionId: string,
  ): readonly RouteGeometry[]
}

function cloneGeometry(geometry: RouteGeometry): RouteGeometry {
  return {
    ...geometry,
    points: geometry.points.map((point) => ({ ...point })),
  }
}

function targetIndex(
  geometries: readonly RouteGeometry[],
  routeId: string,
  directionId: string,
): number {
  const index = geometries.findIndex(
    (geometry) =>
      geometry.routeId === routeId && geometry.directionId === directionId,
  )
  if (index < 0) {
    throw new Error(`未找到待审核轨迹: ${routeId}/${directionId}`)
  }
  return index
}

export function createRouteGeometryReviewService(
  repository: RouteGeometryRepository,
): RouteGeometryReviewService {
  return {
    getForReview: (routeId, directionId) =>
      repository.getRouteGeometryForReview(routeId, directionId),
    approve(geometries, routeId, directionId) {
      const index = targetIndex(geometries, routeId, directionId)
      const target = geometries[index]!
      if (target.dataStatus === 'verified') {
        throw new Error(`轨迹 ${routeId}/${directionId} 已通过审核`)
      }
      if (target.source.trim().length === 0) {
        throw new Error(`轨迹 ${routeId}/${directionId} 缺少来源，不能通过审核`)
      }
      return geometries.map((geometry, currentIndex) =>
        currentIndex === index
          ? { ...cloneGeometry(geometry), dataStatus: 'verified' }
          : cloneGeometry(geometry),
      )
    },
    reject(geometries, routeId, directionId) {
      const index = targetIndex(geometries, routeId, directionId)
      if (geometries[index]!.dataStatus === 'verified') {
        throw new Error(`轨迹 ${routeId}/${directionId} 已通过审核，不能作为候选拒绝`)
      }
      return geometries
        .filter((_geometry, currentIndex) => currentIndex !== index)
        .map(cloneGeometry)
    },
  }
}
