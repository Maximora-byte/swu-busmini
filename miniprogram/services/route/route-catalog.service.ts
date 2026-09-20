import type {
  BusDirection,
  BusRoute,
  BusStop,
  VerifiedBusStop,
} from '../../models/index'
import {
  type BusStopRepository,
} from '../repository/bus-stop.repository'
import { reviewedBusStopRepository } from '../repository/reviewed-bus-stop.repository'
import {
  routeRepository,
  type RouteRepository,
} from '../repository/route.repository'
import { validateRoute } from '../validation/route-data-validator'

export interface RouteDetails {
  route: BusRoute
  direction: BusDirection
  stops: readonly BusStop[]
  mappableStops: readonly VerifiedBusStop[]
  pendingCoordinateCount: number
}

export interface RouteCatalogService {
  getRoutes(): readonly BusRoute[]
  getRouteDetails(routeId: string, directionName?: string): RouteDetails
}

export function createRouteCatalogService(
  routes: RouteRepository,
  stops: BusStopRepository,
): RouteCatalogService {
  return {
    getRoutes: () => routes.getAll(),
    getRouteDetails(routeId, directionName) {
      const route = routes.findById(routeId)
      if (!route) {
        throw new Error(`未找到线路: ${routeId}`)
      }
      const validationIssue = validateRoute(route, stops.getAll())[0]
      if (validationIssue) {
        throw new Error(validationIssue.message)
      }

      const direction = directionName
        ? route.directions.find(({ name }) => name === directionName)
        : route.directions[0]
      if (!direction) {
        throw new Error(`线路 ${routeId} 不存在方向: ${directionName ?? ''}`)
      }

      const routeStops = stops.getByIds(direction.stopIds)
      const verifiedStopsById = new Map(
        stops.getVerifiedStops().map((stop) => [stop.id, stop]),
      )
      const addedMappableStopIds = new Set<string>()
      const mappableStops = direction.stopIds.flatMap((stopId) => {
        const stop = verifiedStopsById.get(stopId)
        if (!stop || addedMappableStopIds.has(stopId)) {
          return []
        }
        addedMappableStopIds.add(stopId)
        return [stop]
      })
      const uniqueRouteStopCount = new Set(direction.stopIds).size

      return {
        route,
        direction,
        stops: routeStops,
        mappableStops,
        pendingCoordinateCount: uniqueRouteStopCount - mappableStops.length,
      }
    },
  }
}

export const routeCatalogService = createRouteCatalogService(
  routeRepository,
  reviewedBusStopRepository,
)
