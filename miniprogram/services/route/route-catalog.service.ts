import type {
  BusDirection,
  BusRoute,
  BusStop,
  Coordinate,
} from '../../models/index'
import {
  busStopRepository,
  type BusStopRepository,
} from '../repository/bus-stop.repository'
import {
  routeRepository,
  type RouteRepository,
} from '../repository/route.repository'

export type MappableBusStop = BusStop & { coordinate: Coordinate }

export interface RouteDetails {
  route: BusRoute
  direction: BusDirection
  stops: readonly BusStop[]
  mappableStops: readonly MappableBusStop[]
  pendingCoordinateCount: number
}

export interface RouteCatalogService {
  getRouteDetails(routeId: string, directionName?: string): RouteDetails
}

export function createRouteCatalogService(
  routes: RouteRepository,
  stops: BusStopRepository,
): RouteCatalogService {
  return {
    getRouteDetails(routeId, directionName) {
      const route = routes.findById(routeId)
      if (!route) {
        throw new Error(`未找到线路: ${routeId}`)
      }

      const direction = directionName
        ? route.directions.find(({ name }) => name === directionName)
        : route.directions[0]
      if (!direction) {
        throw new Error(`线路 ${routeId} 不存在方向: ${directionName ?? ''}`)
      }

      const routeStops = stops.getByIds(direction.stopIds)
      const mappableStops = routeStops.filter(
        (stop): stop is MappableBusStop => stop.coordinate !== null,
      )

      return {
        route,
        direction,
        stops: routeStops,
        mappableStops,
        pendingCoordinateCount: routeStops.length - mappableStops.length,
      }
    },
  }
}

export const routeCatalogService = createRouteCatalogService(
  routeRepository,
  busStopRepository,
)
