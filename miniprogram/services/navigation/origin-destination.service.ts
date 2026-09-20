import type {
  BusDirection,
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
}

function matchDirection(
  direction: BusDirection,
  originStopIds: ReadonlySet<string>,
  destinationStopIds: ReadonlySet<string>,
): DirectionMatch | undefined {
  const matchedOriginStopIds = new Set<string>()
  const matchedDestinationStopIds = new Set<string>()

  for (let originIndex = 0; originIndex < direction.stopIds.length; originIndex += 1) {
    const originStopId = direction.stopIds[originIndex]
    if (!originStopId || !originStopIds.has(originStopId)) {
      continue
    }

    for (
      let destinationIndex = originIndex + 1;
      destinationIndex < direction.stopIds.length;
      destinationIndex += 1
    ) {
      const destinationStopId = direction.stopIds[destinationIndex]
      if (destinationStopId && destinationStopIds.has(destinationStopId)) {
        matchedOriginStopIds.add(originStopId)
        matchedDestinationStopIds.add(destinationStopId)
      }
    }
  }

  if (matchedOriginStopIds.size === 0) {
    return undefined
  }

  return {
    originStopIds: matchedOriginStopIds,
    destinationStopIds: matchedDestinationStopIds,
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
        const directions: string[] = []

        for (const direction of route.directions) {
          const match = matchDirection(
            direction,
            originStopIds,
            destinationStopIds,
          )
          if (!match) {
            continue
          }

          directions.push(direction.name)
          match.originStopIds.forEach((stopId) =>
            matchedOriginStopIds.add(stopId),
          )
          match.destinationStopIds.forEach((stopId) =>
            matchedDestinationStopIds.add(stopId),
          )
        }

        if (directions.length === 0) {
          return []
        }

        return [
          {
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
            directions,
            serviceType: route.serviceType,
            dataStatus: route.dataStatus,
            notes:
              route.serviceType === 'flexible_campus_bus'
                ? [FLEXIBLE_ORIGIN_DESTINATION_NOTE]
                : [],
          },
        ]
      })
    },
  }
}

export const originDestinationService = createOriginDestinationService(
  poiRepository,
  routeCatalogService,
)
