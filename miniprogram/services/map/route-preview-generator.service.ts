import type { BusRoute, BusStop, CandidateCoordinate, Coordinate, DrivingRouteResult } from '../../models/index'
import { getLocationViewport } from './map-viewport.service'
import type { MapProvider } from './map-provider'
import type { RoutePreviewCandidate, RoutePreviewData } from './route-preview.types'

export interface RoutePreviewCache {
  geocodes: Record<string, readonly CandidateCoordinate[]>
  driving: Record<string, DrivingRouteResult>
}

export function createEmptyRoutePreviewCache(): RoutePreviewCache {
  return { geocodes: {}, driving: {} }
}

export const PREVIEW_QUERY_NAMES: Readonly<Record<string, string>> = {
  jingguanyuan: '经济管理学院',
  building_8: '第八教学楼',
  tianjiabing: '田家炳教育书院',
  building_5: '第五教学楼',
  canteen_2: '第二食堂',
  foreign_languages: '外国语学院',
  building_26: '第二十六教学楼',
  zhongtu: '中心图书馆',
}

function validCoordinate(point: Coordinate): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && getLocationViewport(point).isWithinArea
}

function coordinateKey(point: Coordinate): string {
  return `${point.latitude},${point.longitude}`
}

function safeErrorCode(error: unknown): string {
  // Never persist external error messages: these may contain a request URL or key.
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  return typeof code === 'string' && ['INVALID_KEY', 'API_ERROR', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'REQUEST_LIMIT'].includes(code)
    ? code : 'REQUEST_FAILED'
}

/** Only an offline experiment. It deliberately does not accept any data writer or review repository. */
export async function generateRoutePreview(
  routes: readonly BusRoute[],
  stops: readonly BusStop[],
  provider: Pick<MapProvider, 'geocode' | 'drivingRoute'>,
  cache: RoutePreviewCache = createEmptyRoutePreviewCache(),
  generatedAt = new Date().toISOString(),
): Promise<RoutePreviewData> {
  const result: RoutePreviewData = { generatedAt, candidates: [], segments: [], warnings: [] }
  const usedIds = new Set(routes.flatMap(({ directions }) => directions.flatMap(({ stopIds }) => stopIds)))
  const stopById = new Map(stops.map((stop) => [stop.id, stop]))
  const candidates = new Map<string, RoutePreviewCandidate>()
  for (const stopId of usedIds) {
    const stop = stopById.get(stopId)
    if (!stop) {
      result.warnings.push(`Unknown stop: ${stopId}`)
      continue
    }
    const query = `重庆市北碚区西南大学${PREVIEW_QUERY_NAMES[stopId] ?? stop.name}`
    const record: RoutePreviewCandidate = { stopId, query, candidate: null, usableForPreview: false, warnings: [] }
    try {
      let values = cache.geocodes[query]
      if (!values) {
        values = await provider.geocode(query)
        cache.geocodes[query] = values
      }
      const candidate = values[0]
      if (!candidate) record.warnings.push('No geocoding result')
      else if (!validCoordinate(candidate.coordinate) || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) record.warnings.push('Invalid/outside Beibei coordinate or confidence')
      else {
        record.candidate = { coordinate: { ...candidate.coordinate }, source: 'tencent', confidence: candidate.confidence, verified: false }
        record.usableForPreview = candidate.confidence >= 0.8
        if (!record.usableForPreview) record.warnings.push('Low geocoding confidence')
      }
    } catch (error: unknown) {
      record.warnings.push(`Geocoding failed: ${safeErrorCode(error)}`)
    }
    candidates.set(stopId, record)
    result.candidates.push(record)
  }

  const byCoordinate = new Map<string, RoutePreviewCandidate[]>()
  for (const candidate of result.candidates) {
    if (!candidate.candidate) continue
    const key = coordinateKey(candidate.candidate.coordinate)
    byCoordinate.set(key, [...(byCoordinate.get(key) ?? []), candidate])
  }
  for (const group of byCoordinate.values()) {
    if (group.length < 2) continue
    for (const candidate of group) {
      candidate.usableForPreview = false
      candidate.warnings.push(`Duplicate coordinate shared by: ${group.map(({ stopId }) => stopId).join(', ')}`)
    }
  }

  for (const route of routes) {
    for (const direction of route.directions) {
      for (let index = 1; index < direction.stopIds.length; index += 1) {
        const fromStopId = direction.stopIds[index - 1]!
        const toStopId = direction.stopIds[index]!
        const from = candidates.get(fromStopId)
        const to = candidates.get(toStopId)
        const label = `${route.id}/${direction.name}/${fromStopId}->${toStopId}`
        if (!from?.usableForPreview || !to?.usableForPreview || !from.candidate || !to.candidate) {
          result.warnings.push(`Missing usable candidate: ${label}`)
          continue
        }
        const origin = from.candidate.coordinate
        const destination = to.candidate.coordinate
        const key = `${coordinateKey(origin)}>${coordinateKey(destination)}`
        try {
          let driving = cache.driving[key]
          if (!driving) {
            driving = await provider.drivingRoute(origin, destination)
            cache.driving[key] = driving
          }
          if (driving.polyline.length < 2 || !driving.polyline.every(validCoordinate)) {
            result.warnings.push(`Invalid driving polyline: ${label}`)
            continue
          }
          const points = driving.polyline.filter((point, pointIndex, all) => pointIndex === 0 || coordinateKey(point) !== coordinateKey(all[pointIndex - 1]!)).map((point) => ({ ...point }))
          if (points.length < 2) {
            result.warnings.push(`Empty driving segment: ${label}`)
            continue
          }
          result.segments.push({ routeId: route.id, directionId: direction.name, fromStopId, toStopId, points, source: 'tencent_driving', dataStatus: 'needs_review' })
        } catch (error: unknown) {
          result.warnings.push(`Driving failed (${safeErrorCode(error)}): ${label}`)
        }
      }
    }
  }
  for (const record of result.candidates) {
    for (const warning of record.warnings) result.warnings.push(`${record.stopId}: ${warning}`)
  }
  return result
}
