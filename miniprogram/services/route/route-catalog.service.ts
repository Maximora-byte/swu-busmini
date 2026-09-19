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
  getRoutes(): readonly BusRoute[]
  getRouteDetails(routeId: string, directionName?: string): RouteDetails
}

export function createRouteCatalogService(
  routes: RouteRepository,
  stops: BusStopRepository,
): RouteCatalogService {
  function validateRoute(route: BusRoute): void {
    for (const direction of route.directions) {
      const stopIdCounts = new Map<string, number>()
      const missingStopIds = new Set<string>()

      for (const stopId of direction.stopIds) {
        stopIdCounts.set(stopId, (stopIdCounts.get(stopId) ?? 0) + 1)

        if (!stops.findById(stopId)) {
          missingStopIds.add(stopId)
        }
      }

      const firstStopId = direction.stopIds[0]
      const lastStopId = direction.stopIds[direction.stopIds.length - 1]
      if (direction.isLoop && firstStopId !== lastStopId) {
        throw new Error(
          `线路 ${route.id} 方向 ${direction.name} 标记为环线，但首尾站点不同`,
        )
      }

      if (!direction.isLoop && firstStopId === lastStopId) {
        throw new Error(
          `线路 ${route.id} 方向 ${direction.name} 首尾站点相同，但未标记为环线`,
        )
      }

      const explicitlyAllowed = new Set(
        direction.allowedRepeatedStopIds ?? [],
      )
      if (!direction.isLoop && explicitlyAllowed.size > 0) {
        throw new Error(
          `线路 ${route.id} 方向 ${direction.name} 不是环线，不能声明重复站点白名单`,
        )
      }

      const invalidAllowedStopIds = [...explicitlyAllowed].filter(
        (stopId) => (stopIdCounts.get(stopId) ?? 0) < 2,
      )
      if (invalidAllowedStopIds.length > 0) {
        throw new Error(
          `线路 ${route.id} 方向 ${direction.name} 声明了未重复的 stopId: ${invalidAllowedStopIds.join(', ')}`,
        )
      }

      const duplicateStopIds = [...stopIdCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([stopId]) => stopId)
      const unexpectedDuplicateStopIds = duplicateStopIds.filter((stopId) => {
        const isLoopClosure =
          direction.isLoop &&
          stopId === firstStopId &&
          stopId === lastStopId &&
          stopIdCounts.get(stopId) === 2
        return !isLoopClosure && !explicitlyAllowed.has(stopId)
      })

      if (unexpectedDuplicateStopIds.length > 0) {
        throw new Error(
          `线路 ${route.id} 方向 ${direction.name} 存在未声明的重复 stopId: ${unexpectedDuplicateStopIds.join(', ')}`,
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
    getRoutes: () => routes.getAll(),
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
  busStopRepository,
)
