import type { BusRoute, CampusPOI } from '../../models/index'
import {
  poiRepository,
  type PoiRepository,
} from '../repository/poi.repository'
import {
  routeCatalogService,
  type RouteCatalogService,
} from '../route/route-catalog.service'

export interface PoiRouteResult {
  poi: CampusPOI
  routes: readonly BusRoute[]
}

export interface PoiRouteService {
  getRoutesForPoi(poiId: string): PoiRouteResult
}

export function createPoiRouteService(
  pois: PoiRepository,
  routes: RouteCatalogService,
): PoiRouteService {
  return {
    getRoutesForPoi(poiId) {
      const poi = pois.findById(poiId)
      if (!poi) {
        throw new Error(`未找到校园地点: ${poiId}`)
      }

      const relatedStopIds = new Set(poi.relatedStopIds)
      const reachableRoutes = routes.getRoutes().filter((route) =>
        route.directions.some((direction) =>
          direction.stopIds.some((stopId) => relatedStopIds.has(stopId)),
        ),
      )

      return { poi, routes: reachableRoutes }
    },
  }
}

export const poiRouteService = createPoiRouteService(
  poiRepository,
  routeCatalogService,
)
