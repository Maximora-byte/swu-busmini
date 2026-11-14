import type { Coordinate } from '../../models/index'
import type { TransitDataset } from '../../models/current-transit'
import { distanceBetween } from '../../utils/distance'
import { getUnifiedTransitStops } from '../map/unified-transit-stops'
import { isAutomaticBoardingVisit } from './transit-visit-policy'

export interface NearbyCampusStation {
  stationId: string
  stopId: string
  name: string
  coordinate: Coordinate
  /** Distance from the map selection, not the user's GPS or a walking route. */
  distanceMeters: number
  routeNames: string[]
}

function valid(point: Coordinate | undefined): point is Coordinate {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
}

export function createNearestCampusStationService(dataset: TransitDataset) {
  const stops = dataset.stops.filter((stop) => valid(stop.coordinate)).map((stop) => ({ ...stop, coordinate: { ...stop.coordinate } }))
  const groups = getUnifiedTransitStops({ ...dataset, stops })
  const entries = groups.map((group) => ({ stationId: group.id, name: group.label,
    stops: stops.filter((stop) => group.stopIds.includes(stop.id)).flatMap((stop) => {
      const routeNames = dataset.routes.filter((route) => route.visits.some((visit) =>
        visit.stopId === stop.id && isAutomaticBoardingVisit(visit))).map((route) => route.name)
      return routeNames.length ? [{ ...stop, routeNames: [...new Set(routeNames)] }] : []
    }),
  }))
  return {
    nearby(point: Coordinate): { stations: NearbyCampusStation[]; message: string } {
      if (!valid(point)) return { stations: [], message: '没有取得有效地图位置，请重新点选。' }
      const stations = entries.flatMap((entry) => {
        const nearest = entry.stops.map((stop) => ({ stop, distance: distanceBetween(point, stop.coordinate) }))
          .sort((a, b) => a.distance - b.distance || a.stop.id.localeCompare(b.stop.id))[0]
        if (!nearest || nearest.distance > 800) return []
        return [{ stationId: entry.stationId, stopId: nearest.stop.id, name: entry.name,
          coordinate: { ...nearest.stop.coordinate }, distanceMeters: nearest.distance, routeNames: [...nearest.stop.routeNames] }]
      }).sort((a, b) => a.distanceMeters - b.distanceMeters || a.stopId.localeCompare(b.stopId)).slice(0, 3)
      return { stations, message: stations.length ? '按距所选位置的直线距离推荐，实际步行路线请在地图导航中查看。' :
        '所选位置800米内没有已发布的可用校车站，请换一个校内位置。' }
    },
  }
}
