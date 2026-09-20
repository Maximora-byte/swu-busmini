import type { Coordinate, WalkingRouteResult } from '../../models/index'
import type { MapProvider } from './map-provider'

export interface WalkingRouteService {
  getWalkingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<WalkingRouteResult>
}

export function createWalkingRouteService(
  provider: MapProvider,
): WalkingRouteService {
  return {
    getWalkingRoute: (origin, destination) =>
      provider.walkingRoute(origin, destination),
  }
}
