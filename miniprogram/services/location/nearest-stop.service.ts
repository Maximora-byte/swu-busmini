import type { Coordinate, NearestStopResult } from '../../models/index'
import { distanceBetween } from '../../utils/distance'
import {
  busStopRepository,
  type BusStopRepository,
} from '../repository/bus-stop.repository'

export interface NearestStopService {
  getNearestStops(origin: Coordinate): readonly NearestStopResult[]
}

export function createNearestStopService(
  stops: BusStopRepository,
): NearestStopService {
  return {
    getNearestStops(origin) {
      return stops
        .getVerifiedStops()
        .map((stop): NearestStopResult => {
          const coordinate: Coordinate = {
            latitude: stop.coordinate.latitude,
            longitude: stop.coordinate.longitude,
          }

          return {
            stopId: stop.id,
            stopName: stop.name,
            distanceMeters: distanceBetween(origin, coordinate),
            coordinate,
          }
        })
        .sort(
          (a, b) =>
            a.distanceMeters - b.distanceMeters ||
            a.stopId.localeCompare(b.stopId),
        )
    },
  }
}

export const nearestStopService = createNearestStopService(busStopRepository)
