import type { TransitDataset, TransitRoute, TransitVisit, TransitVisitDirection } from '../../models/current-transit'
import { isAutomaticBoardingVisit } from '../navigation/transit-visit-policy'

export interface StationReferenceDirection {
  id: 'a' | 'b'
  label: string
  hint: string
  allowedVisits: TransitVisitDirection[]
  canDepart: boolean
  canArrive: boolean
  routes: { routeId: string; name: string; color: string; canUse: boolean; statusText: string }[]
}

function tangent(route: TransitRoute, visit: TransitVisit): [number, number] | undefined {
  const edge = (index: number): [number, number] | undefined => {
    const a = route.points[index], b = route.points[index + 1]
    if (!a || !b) return undefined
    const x = (b.longitude - a.longitude) * Math.cos((a.latitude + b.latitude) * Math.PI / 360)
    const y = b.latitude - a.latitude, length = Math.hypot(x, y)
    return Number.isFinite(length) && length > 1e-9 ? [x / length, y / length] : undefined
  }
  const current = edge(visit.segmentIndex)
  if (!current) return undefined
  const neighborIndex = visit.ratio >= 1 - 1e-8 ? visit.segmentIndex + 1 : visit.ratio <= 1e-8 ? visit.segmentIndex - 1 : undefined
  if (neighborIndex === undefined) return current
  const step = neighborIndex > visit.segmentIndex ? 1 : -1
  for (let index = neighborIndex; index >= 0 && index < route.points.length - 1; index += step) {
    const neighbor = edge(index)
    if (!neighbor) continue
    // At a cusp/turn, opposite source orders are not necessarily opposite local departures.
    if (current[0] * neighbor[0] + current[1] * neighbor[1] < .5) return undefined
    const x = current[0] + neighbor[0], y = current[1] + neighbor[1], length = Math.hypot(x, y)
    return [x / length, y / length]
  }
  return current
}

/** Two geometric reference orders; never creates physical platforms or confirms service directions. */
export function getStationReferenceDirections(dataset: TransitDataset, stopIds: readonly string[]): StationReferenceDirection[] {
  const entries = dataset.routes.flatMap((route) => route.visits.flatMap((visit, visitIndex) =>
    stopIds.includes(visit.stopId) ? [{ route, visit, visitIndex, vector: tangent(route, visit) }] : []))
  const vectors = entries.filter((entry) => isAutomaticBoardingVisit(entry.visit) && entry.vector).map((entry) => entry.vector!)
  if (!vectors.length) return []
  const score = (axis: [number, number]) => vectors.reduce((sum, v) => sum + Math.abs(axis[0] * v[0] + axis[1] * v[1]), 0)
  let axis = vectors.reduce((best, v) => score(v) > score(best) ? v : best)
  if (axis[1] < -1e-8 || (Math.abs(axis[1]) <= 1e-8 && axis[0] < 0)) axis = [-axis[0], -axis[1]]
  const stopsById = new Map(dataset.stops.map((stop) => [stop.id, stop]))
  return (['a', 'b'] as const).map((id) => {
    const aligned = entries.flatMap((entry) => {
      if (!entry.vector || !isAutomaticBoardingVisit(entry.visit)) return []
      const dot = axis[0] * entry.vector[0] + axis[1] * entry.vector[1]
      // Junction branches need their own route view, not an invented opposite platform.
      if (Math.abs(dot) < .5) return []
      const forward = (dot >= 0) === (id === 'a')
      return [{ ...entry, directionId: forward ? 'forward' as const : 'reverse' as const }]
    })
    const allowedVisits = aligned.map(({ route, visitIndex, directionId }) => ({ routeId: route.id, visitIndex, directionId }))
    const canRide = (departure: boolean) => aligned.some(({ route, visit, directionId }) => route.visits.some((other) =>
      other.stopId !== visit.stopId && isAutomaticBoardingVisit(other) &&
      (other.mileageMeters - visit.mileageMeters) * (directionId === 'forward' ? 1 : -1) * (departure ? 1 : -1) > 1))
    const next = aligned.map(({ route, visitIndex, directionId }) =>
      stopsById.get(route.visits[visitIndex + (directionId === 'forward' ? 1 : -1)]?.stopId)?.name).find(Boolean)
    const routes = dataset.routes.flatMap((route) => {
      const records = entries.filter((entry) => entry.route.id === route.id)
      if (!records.length) return []
      const canUse = allowedVisits.some((rule) => rule.routeId === route.id)
      return [{ routeId: route.id, name: route.name, color: route.color, canUse,
        statusText: canUse ? '' : records.some((entry) => isAutomaticBoardingVisit(entry.visit)) ? '方向待核对' : '位置待核对' }]
    })
    return { id, label: id === 'a' ? '参考方向 A' : '参考方向 B', hint: next ? `参考经由 ${next}` : '参照发布轨迹，实际方向请现场核对',
      allowedVisits, canDepart: canRide(true), canArrive: canRide(false), routes }
  })
}
