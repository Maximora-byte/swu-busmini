import { routePreviewData } from '../../data/route-preview'
import type { Coordinate } from '../../models/index'
import { getLocationViewport } from '../map/map-viewport.service'
import type { RoutePreviewData, RoutePreviewSegment } from '../map/route-preview.types'
import { routeRepository, type RouteRepository } from './route.repository'

export interface RoutePreviewRepository {
  getAll(): readonly RoutePreviewSegment[]
  getSegments(routeId: string, directionId?: string): readonly RoutePreviewSegment[]
  getSummary(): {
    generatedAt: string | null
    candidateCount: number
    segmentCount: number
    warnings: readonly string[]
  }
}

export function isValidPreviewCoordinate(point: Coordinate): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && getLocationViewport(point).isWithinArea
}

function clone(segment: RoutePreviewSegment): RoutePreviewSegment {
  return { ...segment, points: segment.points.map((point) => ({ ...point })) }
}

export function createRoutePreviewRepository(
  data: RoutePreviewData,
  routes: RouteRepository = routeRepository,
): RoutePreviewRepository {
  const warnings = [...data.warnings]
  const ids = new Set<string>()
  const segments = data.segments.filter((segment) => {
    const direction = routes.findById(segment.routeId)?.directions.find(({ name }) => name === segment.directionId)
    const key = JSON.stringify([segment.routeId, segment.directionId, segment.fromStopId, segment.toStopId])
    const valid = direction !== undefined &&
      direction.stopIds.some((id, index) => id === segment.fromStopId && direction.stopIds[index + 1] === segment.toStopId) &&
      segment.dataStatus === 'needs_review' && segment.source === 'tencent_driving' &&
      segment.points.length >= 2 && segment.points.every(isValidPreviewCoordinate) &&
      segment.points.some((point) => point.latitude !== segment.points[0]!.latitude || point.longitude !== segment.points[0]!.longitude) &&
      !ids.has(key)
    if (!valid) warnings.push(`Ignored invalid preview segment: ${segment.routeId}/${segment.directionId}/${segment.fromStopId}/${segment.toStopId}`)
    if (valid) ids.add(key)
    return valid
  }).map(clone)
  return {
    getAll: () => segments.map(clone),
    getSegments: (routeId, directionId) => segments.filter((segment) =>
      segment.routeId === routeId && (directionId === undefined || segment.directionId === directionId),
    ).map(clone),
    getSummary: () => ({
      generatedAt: data.generatedAt,
      candidateCount: data.candidates.filter(({ candidate }) => candidate !== null).length,
      segmentCount: segments.length,
      warnings: [...warnings],
    }),
  }
}

export const routePreviewRepository = createRoutePreviewRepository(routePreviewData)
