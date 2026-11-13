import { currentTransitDataset } from '../../data/current-transit'
import type { TransitDataset, TransitRoute, TransitStop, TransitVisit } from '../../models/current-transit'
import type { Coordinate } from '../../models/index'
import { distanceBetween } from '../../utils/distance'

export interface CurrentTransitRepository {
  getDataset(): TransitDataset
  getStop(id: string): TransitStop | undefined
  getRoute(id: string): TransitRoute | undefined
}

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid current transit record')
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unapproved current transit field')
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid current transit text')
  return value
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid current transit array')
  return value
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid current transit number')
  return value
}

function coordinate(value: unknown): Coordinate {
  const point = object(value, ['latitude', 'longitude'])
  const latitude = number(point.latitude)
  const longitude = number(point.longitude)
  if (latitude < 29.80 || latitude > 29.85 || longitude < 106.40 || longitude > 106.45) throw new Error('Current transit coordinate outside Beibei bounds')
  return { latitude, longitude }
}

function cloneStop(stop: TransitStop): TransitStop {
  return { ...stop, coordinate: { ...stop.coordinate } }
}

function cloneRoute(route: TransitRoute): TransitRoute {
  return {
    ...route, points: route.points.map((point) => ({ ...point })),
    visits: route.visits.map((visit) => ({ ...visit })), warnings: [...route.warnings],
  }
}

/** Independent published-data gate; historical manually reviewed data is not read or relaxed. */
export function createCurrentTransitRepository(input: unknown): CurrentTransitRepository {
  const value = object(input, ['id', 'source', 'observedAt', 'coordinateSystem', 'quality', 'stops', 'routes'])
  const id = text(value.id)
  const source = text(value.source)
  const observedAt = text(value.observedAt)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observedAt) || !Number.isFinite(Date.parse(observedAt)) ||
    new Date(observedAt).toISOString().slice(0, 10) !== observedAt) throw new Error('Invalid current transit observedAt')
  if (value.coordinateSystem !== 'GCJ-02' || value.quality !== 'operator_published') throw new Error('Invalid current transit quality or coordinate system')
  const stopById = new Map<string, TransitStop>()
  const physicalKeys = new Set<string>()
  const stops = list(value.stops).map((input): TransitStop => {
    const stop = object(input, ['id', 'name', 'coordinate'])
    const parsed = { id: text(stop.id), name: text(stop.name), coordinate: coordinate(stop.coordinate) }
    const key = JSON.stringify([parsed.name, parsed.coordinate.latitude.toFixed(6), parsed.coordinate.longitude.toFixed(6)])
    if (stopById.has(parsed.id) || physicalKeys.has(key)) throw new Error('Duplicate current transit stop')
    physicalKeys.add(key)
    stopById.set(parsed.id, parsed)
    return parsed
  })
  if (!stops.length) throw new Error('Current transit dataset has no stops')
  const routeById = new Map<string, TransitRoute>()
  const referencedStops = new Set<string>()
  const allowedRouteIds = new Set(['route_1', 'route_2', 'route_3', 'route_3b', 'route_4', 'route_5', 'route_6', 'route_7', 'route_8', 'route_jingguan'])
  const routes = list(value.routes).map((input): TransitRoute => {
    const route = object(input, ['id', 'name', 'color', 'points', 'visits', 'warnings'])
    const routeId = text(route.id)
    if (!allowedRouteIds.has(routeId) || routeById.has(routeId)) throw new Error('Unknown or duplicate current route id')
    const name = text(route.name)
    const color = text(route.color)
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Invalid current transit color')
    const points = list(route.points).map(coordinate)
    if (points.length < 2) throw new Error('Current transit route needs at least two points')
    const cumulative = [0]
    for (let index = 1; index < points.length; index++) cumulative.push(cumulative[index - 1] + distanceBetween(points[index - 1], points[index]))
    if (cumulative[cumulative.length - 1] <= 0) throw new Error('Current transit route has zero length')
    const sourceIndices = new Set<number>()
    const visits = list(route.visits).map((input): TransitVisit => {
      const visit = object(input, ['stopId', 'sourceIndex', 'segmentIndex', 'ratio', 'mileageMeters', 'offsetMeters'])
      const stopId = text(visit.stopId)
      const stop = stopById.get(stopId)
      if (!stop) throw new Error('Current transit visit references unknown stop')
      const sourceIndex = number(visit.sourceIndex)
      const segmentIndex = number(visit.segmentIndex)
      const ratio = number(visit.ratio)
      const mileageMeters = number(visit.mileageMeters)
      const offsetMeters = number(visit.offsetMeters)
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndices.has(sourceIndex) ||
        !Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= points.length - 1 ||
        ratio < 0 || ratio > 1 || mileageMeters < 0 || offsetMeters < 0 || offsetMeters > 150) {
        throw new Error('Invalid current transit visit anchor')
      }
      sourceIndices.add(sourceIndex)
      const start = points[segmentIndex]
      const end = points[segmentIndex + 1]
      const length = cumulative[segmentIndex + 1] - cumulative[segmentIndex]
      const anchor = {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      }
      if (length <= 0 || Math.abs(cumulative[segmentIndex] + length * ratio - mileageMeters) > 0.02 ||
        Math.abs(distanceBetween(stop.coordinate, anchor) - offsetMeters) > 0.02) {
        throw new Error('Inconsistent current transit anchor mileage or offset')
      }
      referencedStops.add(stopId)
      return { stopId, sourceIndex, segmentIndex, ratio, mileageMeters, offsetMeters }
    })
    if (visits.length < 2 || [...sourceIndices].some((index) => index >= visits.length) ||
      visits.some((visit, index) => index > 0 && visit.mileageMeters < visits[index - 1].mileageMeters)) {
      throw new Error('Current transit visits must be complete and sorted by mileage')
    }
    const warnings = list(route.warnings).map(text)
    for (const visit of visits) {
      if (visit.offsetMeters > 35 && !warnings.some((warning) => warning.includes(stopById.get(visit.stopId)!.name))) {
        throw new Error('Current transit visit over 35 meters must have an offset warning')
      }
    }
    const parsed = { id: routeId, name, color, points, visits, warnings }
    routeById.set(routeId, parsed)
    return parsed
  })
  if (!routes.length || referencedStops.size !== stops.length) throw new Error('Current dataset has no routes or has unserved stop records')
  const dataset: TransitDataset = { id, source, observedAt, coordinateSystem: 'GCJ-02', quality: 'operator_published', stops, routes }
  return {
    getDataset: () => ({ ...dataset, stops: stops.map(cloneStop), routes: routes.map(cloneRoute) }),
    getStop(id) { const stop = stopById.get(id); return stop ? cloneStop(stop) : undefined },
    getRoute(id) { const route = routeById.get(id); return route ? cloneRoute(route) : undefined },
  }
}

export const currentTransitRepository = createCurrentTransitRepository(currentTransitDataset)
