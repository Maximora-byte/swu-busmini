import type {
  BusDirection,
  BusRoute,
  RoutePathRecommendation,
} from '../../models/index'
import {
  poiRepository,
  type PoiRepository,
} from '../repository/poi.repository'
import {
  routeCatalogService,
  type RouteCatalogService,
} from '../route/route-catalog.service'
import { findDirectedRouteLegs } from './directed-route-legs'

export const FLEXIBLE_ORIGIN_DESTINATION_NOTE =
  '该线路支持沿途停靠，请结合现场情况确认上下车位置'

export interface OriginDestinationService {
  findDirectRoutes(
    originPoiId: string,
    destinationPoiId: string,
  ): readonly RoutePathRecommendation[]
}

interface DirectionMatch {
  originStopIds: ReadonlySet<string>
  destinationStopIds: ReadonlySet<string>
  minimumReferenceSegments: number
}

function matchDirection(
  route: BusRoute,
  direction: BusDirection,
  originStopIds: ReadonlySet<string>,
  destinationStopIds: ReadonlySet<string>,
): DirectionMatch | undefined {
  const legs = findDirectedRouteLegs(route, direction, originStopIds, destinationStopIds)
  if (!legs.length) return undefined
  return {
    originStopIds: new Set(legs.map((leg) => leg.originStopId)),
    destinationStopIds: new Set(legs.map((leg) => leg.destinationStopId)),
    minimumReferenceSegments: legs[0].stopIds.length - 1,
  }
}

export function createOriginDestinationService(
  pois: PoiRepository,
  routes: RouteCatalogService,
): OriginDestinationService {
  return {
    findDirectRoutes(originPoiId, destinationPoiId) {
      const originPoi = pois.findById(originPoiId)
      if (!originPoi) {
        throw new Error(`未找到起点校园地点: ${originPoiId}`)
      }

      const destinationPoi = pois.findById(destinationPoiId)
      if (!destinationPoi) {
        throw new Error(`未找到终点校园地点: ${destinationPoiId}`)
      }

      if (
        originPoi.relatedStopIds.length === 0 ||
        destinationPoi.relatedStopIds.length === 0
      ) {
        return []
      }

      const originStopIds = new Set(originPoi.relatedStopIds)
      const destinationStopIds = new Set(destinationPoi.relatedStopIds)

      return routes.getRoutes().flatMap((route) => {
        const matchedOriginStopIds = new Set<string>()
        const matchedDestinationStopIds = new Set<string>()
        const directionMatches: { name: string; segments: number }[] = []

        for (const direction of route.directions) {
          routes.getRouteDetails(route.id, direction.name)
          const match = matchDirection(
            route,
            direction,
            originStopIds,
            destinationStopIds,
          )
          if (!match) {
            continue
          }

          directionMatches.push({ name: direction.name, segments: match.minimumReferenceSegments })
          match.originStopIds.forEach((stopId) =>
            matchedOriginStopIds.add(stopId),
          )
          match.destinationStopIds.forEach((stopId) =>
            matchedDestinationStopIds.add(stopId),
          )
        }

        if (directionMatches.length === 0) {
          return []
        }

        directionMatches.sort((left, right) => left.segments - right.segments ||
          (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
        const recommendation: RoutePathRecommendation = {
            originPoiId: originPoi.id,
            destinationPoiId: destinationPoi.id,
            routeId: route.id,
            routeName: route.name,
            originStopIds: originPoi.relatedStopIds.filter((stopId) =>
              matchedOriginStopIds.has(stopId),
            ),
            destinationStopIds: destinationPoi.relatedStopIds.filter(
              (stopId) => matchedDestinationStopIds.has(stopId),
            ),
            directions: directionMatches.map(({ name }) => name),
            serviceType: route.serviceType,
            dataStatus: route.dataStatus,
            notes:
              route.serviceType === 'flexible_campus_bus'
                ? [FLEXIBLE_ORIGIN_DESTINATION_NOTE]
                : [],
          }
        return [{ recommendation, segments: directionMatches[0].segments }]
      }).sort((left, right) => left.segments - right.segments ||
        (left.recommendation.routeId < right.recommendation.routeId ? -1 : left.recommendation.routeId > right.recommendation.routeId ? 1 : 0))
        .map(({ recommendation }) => recommendation)
    },
  }
}

export const originDestinationService = createOriginDestinationService(
  poiRepository,
  routeCatalogService,
)
