import type {
  BusDirection,
  BusRoute,
  BusStop,
  VerifiedBusStop,
} from '../../models/index'
import {
  busStopRepository,
  type BusStopRepository,
} from '../repository/bus-stop.repository'
import {
  routeRepository,
  type RouteRepository,
} from '../repository/route.repository'

export interface RouteDetails {
  route: BusRoute
  direction: BusDirection
  stops: readonly BusStop[]
  mappableStops: readonly VerifiedBusStop[]
  pendingCoordinateCount: number
}

export interface RouteCatalogService {
  getRouteDetails(routeId: string, directionName?: string): RouteDetails
}

export function createRouteCatalogService(
  routes: RouteRepository,
  stops: BusStopRepository,
): RouteCatalogService {
  function validateRoute(route: BusRoute): void {
    for (const direction of route.directions) {
      const seenStopIds = new Set<string>()
      const duplicateStopIds = new Set<string>()
      const missingStopIds = new Set<string>()

      for (const stopId of direction.stopIds) {
        if (seenStopIds.has(stopId)) {
          duplicateStopIds.add(stopId)
        }
        seenStopIds.add(stopId)

        if (!stops.findById(stopId)) {
          missingStopIds.add(stopId)
        }
      }

      if (duplicateStopIds.size > 0) {
        throw new Error(
          `线路 ${route.id} 方向 ${direction.name} 存在重复 stopId: ${[
            ...duplicateStopIds,
          ].join(', ')}`,
        )
      }

      if (missingStopIds.size > 0) {
        throw new Error(
          `线路 ${route.id} 方向 ${direction.name} 引用了未定义站点: ${[
            ...missingStopIds,
          ].join(', ')}`,
        )
      }
    }
  }

  return {
    getRouteDetails(routeId, directionName) {
      const route = routes.findById(routeId)
      if (!route) {
        throw new Error(`未找到线路: ${routeId}`)
      }
      validateRoute(route)

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
      const mappableStops = direction.stopIds.flatMap((stopId) => {
        const stop = verifiedStopsById.get(stopId)
        return stop ? [stop] : []
      })

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
