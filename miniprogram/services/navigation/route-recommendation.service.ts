import type {
  PoiRouteRecommendations,
  RouteRecommendation,
} from '../../models/index'
import {
  poiRouteService,
  type PoiRouteService,
} from './poi-route.service'
import {
  poiRepository,
  type PoiRepository,
} from '../repository/poi.repository'

export const FLEXIBLE_CAMPUS_BUS_NOTE =
  '该线路支持沿途停靠，请结合现场情况确认上车位置'

export interface RouteRecommendationService {
  recommendRoutesForPoi(poiId: string): readonly RouteRecommendation[]
  searchAndRecommend(keyword: string): readonly PoiRouteRecommendations[]
}

export function createRouteRecommendationService(
  pois: PoiRepository,
  poiRoutes: PoiRouteService,
): RouteRecommendationService {
  function recommendRoutesForPoi(
    poiId: string,
  ): readonly RouteRecommendation[] {
    const { poi, routes } = poiRoutes.getRoutesForPoi(poiId)
    const relatedStopIds = new Set(poi.relatedStopIds)

    return routes.map((route) => {
      const routeStopIds = new Set(
        route.directions.flatMap(({ stopIds }) => stopIds),
      )
      const matchedStopIds = [
        ...new Set(
          poi.relatedStopIds.filter((stopId) => routeStopIds.has(stopId)),
        ),
      ]
      const directions = route.directions
        .filter(({ stopIds }) =>
          stopIds.some((stopId) => relatedStopIds.has(stopId)),
        )
        .map(({ name }) => name)

      return {
        routeId: route.id,
        routeName: route.name,
        matchedStopIds,
        directions,
        serviceType: route.serviceType,
        dataStatus: route.dataStatus,
        note:
          route.serviceType === 'flexible_campus_bus'
            ? FLEXIBLE_CAMPUS_BUS_NOTE
            : undefined,
      }
    })
  }

  return {
    recommendRoutesForPoi,
    searchAndRecommend(keyword) {
      return pois.search(keyword).map((destination) => ({
        destination,
        routes: [...recommendRoutesForPoi(destination.id)],
      }))
    },
  }
}

export const routeRecommendationService = createRouteRecommendationService(
  poiRepository,
  poiRouteService,
)
