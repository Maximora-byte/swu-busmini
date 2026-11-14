import type { TransitDataset, TransitStop } from '../../models/current-transit'
import type { Coordinate } from '../../models/index'
import { distanceBetween } from '../../utils/distance'
import { isAutomaticBoardingVisit } from '../navigation/transit-visit-policy'
import { getStationReferenceDirections, type StationReferenceDirection } from './station-reference-directions'

/** Display areas only. These must never replace source stop IDs in routing. */
export interface UnifiedTransitStop {
  id: string
  name: string
  label: string
  coordinate: Coordinate
  stopIds: string[]
  canBoard: boolean
  directions: StationReferenceDirection[]
  routes: {
    routeId: string; name: string; color: string
    visits: { key: string; stopId: string; visitIndex: number; canBoard: boolean; referenceText: string }[]
  }[]
}

export function getUnifiedTransitStops(dataset: TransitDataset): UnifiedTransitStop[] {
  const name = (value: string) => value === '共青花园2号门' ? '共青团花园2号门' : value
  const clusters: TransitStop[][] = []
  for (const stop of dataset.stops) {
    const cluster = clusters.find((items) => name(items[0].name) === name(stop.name) &&
      items.every((other) => distanceBetween(other.coordinate, stop.coordinate) <= 80))
    if (cluster) cluster.push(stop)
    else clusters.push([stop])
  }
  const names = new Map<string, number>()
  const seen = new Map<string, number>()
  clusters.forEach(([stop]) => names.set(name(stop.name), (names.get(name(stop.name)) ?? 0) + 1))
  const stopsById = new Map(dataset.stops.map((stop) => [stop.id, stop]))
  return clusters.map((items) => {
    // Medoid: keep a real published coordinate rather than inventing a boarding point.
    const cost = (stop: TransitStop) => items.reduce((sum, other) => sum + distanceBetween(stop.coordinate, other.coordinate), 0)
    const representative = items.reduce((best, stop) => cost(stop) < cost(best) ? stop : best)
    const stopIds = items.map(({ id }) => id)
    const routes = dataset.routes.flatMap((route) => {
      const visits = route.visits.flatMap((visit, visitIndex) => {
        if (!stopIds.includes(visit.stopId)) return []
        const before = stopsById.get(route.visits[visitIndex - 1]?.stopId)?.name
        const after = stopsById.get(route.visits[visitIndex + 1]?.stopId)?.name
        return [{ key: `${route.id}:${visitIndex}`, stopId: visit.stopId, visitIndex,
          canBoard: isAutomaticBoardingVisit(visit),
          referenceText: [before && `前站 ${before}`, after && `后站 ${after}`].filter(Boolean).join(' · ') || '单个发布参考点' }]
      })
      return visits.length ? [{ routeId: route.id, name: route.name, color: route.color, visits }] : []
    })
    const stationName = name(items[0].name)
    const index = (seen.get(stationName) ?? 0) + 1
    seen.set(stationName, index)
    return { id: `station:${items[0].id}`, name: stationName,
      label: names.get(stationName)! > 1 ? `${stationName} · 站区${index}` : stationName,
      coordinate: { ...representative.coordinate }, stopIds,
      canBoard: routes.some((route) => route.visits.some((visit) => visit.canBoard)), routes,
      directions: getStationReferenceDirections(dataset, stopIds) }
  })
}
