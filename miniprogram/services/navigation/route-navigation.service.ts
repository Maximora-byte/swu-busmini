import type { RouteNavigation } from '../../models/index'
import {
  routeCatalogService,
  type RouteCatalogService,
} from '../route/route-catalog.service'
import {
  routeGeometryRepository,
  type RouteGeometryRepository,
} from '../repository/route-geometry.repository'

export const FLEXIBLE_ROUTE_NAVIGATION_NOTE =
  '该线路支持沿途停靠，请结合现场情况选择安全位置候车'

export interface RouteNavigationService {
  getRouteNavigation(routeId: string): RouteNavigation
}

export function createRouteNavigationService(
  catalog: RouteCatalogService,
  geometries: RouteGeometryRepository = routeGeometryRepository,
): RouteNavigationService {
  return {
    getRouteNavigation(routeId) {
      const route = catalog.getRoutes().find(({ id }) => id === routeId)
      if (!route) {
        throw new Error(`未找到线路: ${routeId}`)
      }

      return {
        routeId: route.id,
        routeName: route.name,
        serviceType: route.serviceType,
        allowIntermediateStop: route.allowIntermediateStop,
        dataStatus: route.dataStatus,
        directions: route.directions.map((direction) => {
          const details = catalog.getRouteDetails(route.id, direction.name)
          return {
            directionId: direction.name,
            name: direction.name,
            isLoop: direction.isLoop,
            stopIds: [...direction.stopIds],
            knownStops: [...details.stops],
            geometry: geometries.getVerifiedGeometry(
              route.id,
              direction.name,
            ),
          }
        }),
        note:
          route.allowIntermediateStop
            ? FLEXIBLE_ROUTE_NAVIGATION_NOTE
            : undefined,
      }
    },
  }
}

export const routeNavigationService = createRouteNavigationService(
  routeCatalogService,
  routeGeometryRepository,
)
