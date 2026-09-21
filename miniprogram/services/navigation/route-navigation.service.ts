import type {
  RouteNavigation,
  RouteNavigationViewModel,
} from '../../models/index'
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
  getRoutes(): readonly RouteNavigationRouteOption[]
  getDirections(routeId: string): readonly RouteNavigationDirectionOption[]
  getRoute(routeId: string): RouteNavigation
  getRouteNavigation(
    routeId: string,
    directionId?: string,
  ): RouteNavigationViewModel
}

export interface RouteNavigationRouteOption {
  routeId: string
  routeName: string
}

export interface RouteNavigationDirectionOption {
  directionId: string
  directionName: string
  summary: string
}

export function createRouteNavigationService(
  catalog: RouteCatalogService,
  geometries: RouteGeometryRepository = routeGeometryRepository,
): RouteNavigationService {
  function getRoute(routeId: string): RouteNavigation {
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
  }

  return {
    getRoutes: () =>
      catalog.getRoutes().map((route) => ({
        routeId: route.id,
        routeName: route.name,
      })),
    getDirections(routeId) {
      return getRoute(routeId).directions.map((direction) => {
        const firstStop = direction.knownStops[0]
        const lastStop = direction.knownStops[direction.knownStops.length - 1]
        return {
          directionId: direction.directionId,
          directionName: direction.name,
          summary:
            firstStop && lastStop
              ? `${firstStop.name} → ${lastStop.name}`
              : direction.name,
        }
      })
    },
    getRoute,
    getRouteNavigation(routeId, directionId) {
      const route = getRoute(routeId)
      const direction = directionId
        ? route.directions.find(({ directionId: id }) => id === directionId)
        : route.directions[0]
      if (!direction) {
        throw new Error(`线路 ${routeId} 不存在方向: ${directionId ?? ''}`)
      }

      return {
        routeId: route.routeId,
        routeName: route.routeName,
        directionId: direction.directionId,
        directionName: direction.name,
        serviceType: route.serviceType,
        allowIntermediateStop: route.allowIntermediateStop,
        stops: direction.knownStops.map((stop) => ({
          stopId: stop.id,
          stopName: stop.name,
          ...(stop.coordinate?.verified === true
            ? {
                coordinate: {
                  latitude: stop.coordinate.latitude,
                  longitude: stop.coordinate.longitude,
                },
              }
            : {}),
        })),
        geometry: direction.geometry,
        note: route.note,
      }
    },
  }
}

export const routeNavigationService = createRouteNavigationService(
  routeCatalogService,
  routeGeometryRepository,
)
