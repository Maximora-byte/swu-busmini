import type {
  BusDirection,
  BusRoute,
  Coordinate,
  RouteGeometry,
  RouteGeometryMode,
} from '../../models/index'
import type { BusStopRepository } from '../repository/bus-stop.repository'
import type { MapProvider } from './map-provider'
import type { RouteGeometryCache } from './route-geometry-cache'

export interface RouteGeometryGeneratorOptions {
  mode?: RouteGeometryMode
  source: string
}

export interface RouteGeometryGeneratorService {
  generateDirection(
    route: BusRoute,
    direction: BusDirection,
  ): Promise<RouteGeometry>
  generateRoute(route: BusRoute): Promise<readonly RouteGeometry[]>
}

function sameCoordinate(a: Coordinate, b: Coordinate): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude
}

function mergeSegment(
  target: Coordinate[],
  segment: readonly Coordinate[],
): void {
  for (const point of segment) {
    const previous = target[target.length - 1]
    if (!previous || !sameCoordinate(previous, point)) {
      target.push({ ...point })
    }
  }
}

export function createRouteGeometryGeneratorService(
  provider: MapProvider,
  stops: BusStopRepository,
  cache: RouteGeometryCache,
  options: RouteGeometryGeneratorOptions,
): RouteGeometryGeneratorService {
  const source = options.source.trim()
  if (source.length === 0) {
    throw new Error('线路轨迹来源不能为空')
  }
  const mode = options.mode ?? 'driving'

  async function requestSegment(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<readonly Coordinate[]> {
    const cached = cache.get(mode, origin, destination)
    if (cached) {
      return cached
    }

    const result =
      mode === 'driving'
        ? await provider.drivingRoute(origin, destination)
        : await provider.walkingRoute(origin, destination)
    if (result.polyline.length < 2) {
      throw new Error('地图 Provider 返回的线路分段少于两个点')
    }
    cache.set(mode, origin, destination, result.polyline)
    return result.polyline
  }

  async function generateDirection(
    route: BusRoute,
    direction: BusDirection,
  ): Promise<RouteGeometry> {
    if (!route.directions.includes(direction)) {
      throw new Error(`方向 ${direction.name} 不属于线路 ${route.id}`)
    }
    if (direction.stopIds.length < 2) {
      throw new Error(`线路 ${route.name} 方向 ${direction.name} 至少需要两个已知站点`)
    }

    const verifiedStopsById = new Map(
      stops.getVerifiedStops().map((stop) => [stop.id, stop]),
    )
    const coordinates = direction.stopIds.map((stopId) => {
      const stop = verifiedStopsById.get(stopId)
      if (!stop) {
        throw new Error(`站点 ${stopId} 尚无已验证坐标，无法生成线路轨迹`)
      }
      return {
        latitude: stop.coordinate.latitude,
        longitude: stop.coordinate.longitude,
      }
    })

    const points: Coordinate[] = []
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const origin = coordinates[index]!
      const destination = coordinates[index + 1]!
      if (sameCoordinate(origin, destination)) {
        mergeSegment(points, [origin])
        continue
      }
      mergeSegment(points, await requestSegment(origin, destination))
    }
    if (points.length < 2) {
      throw new Error(`线路 ${route.name} 方向 ${direction.name} 无法生成有效轨迹`)
    }

    return {
      routeId: route.id,
      directionId: direction.name,
      source,
      dataStatus: 'generated',
      points,
    }
  }

  return {
    generateDirection,
    async generateRoute(route) {
      const geometries: RouteGeometry[] = []
      for (const direction of route.directions) {
        geometries.push(await generateDirection(route, direction))
      }
      return geometries
    },
  }
}
