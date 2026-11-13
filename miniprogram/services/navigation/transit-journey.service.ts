import type { Coordinate } from '../../models/index'
import type { TransitDataset, TransitRoute, TransitStop, TransitVisit } from '../../models/current-transit'
import { distanceBetween } from '../../utils/distance'
import { currentTransitRepository } from '../repository/current-transit.repository'
import { isAutomaticBoardingVisit } from './transit-visit-policy'

export type TransitJourneyEndpoint = { kind: 'stop'; stopId: string } | { kind: 'coordinate'; coordinate: Coordinate }
export interface TransitJourneyLeg {
  routeId: string
  routeName: string
  color: string
  directionId: 'forward' | 'reverse'
  boardingStopId: string
  alightingStopId: string
  boardingVisitIndex: number
  alightingVisitIndex: number
  stopIds: string[]
  points: Coordinate[]
  distanceMeters: number
}
export interface TransitJourney {
  id: string
  legs: TransitJourneyLeg[]
  accessDistanceMeters: number
  egressDistanceMeters: number
  rideDistanceMeters: number
  transferStopId?: string
  warnings: string[]
}
export interface TransitJourneyResult { journeys: TransitJourney[]; message: string }
export interface TransitJourneyService {
  plan(origin: TransitJourneyEndpoint, destination: TransitJourneyEndpoint): TransitJourneyResult
}

interface Candidate { stop: TransitStop; distanceMeters: number }
interface Ride { route: TransitRoute; boardingIndex: number; alightingIndex: number; distanceMeters: number }

const MAX_CONNECTION_METERS = 800
const MAX_CANDIDATES = 6
const MAX_JOURNEYS = 6
const copyPoint = (coordinate: Coordinate): Coordinate => ({ ...coordinate })

function isCoordinate(value: Coordinate | undefined): value is Coordinate {
  return !!value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180
}

function anchor(route: TransitRoute, visit: TransitVisit): Coordinate {
  const start = route.points[visit.segmentIndex]
  const end = route.points[visit.segmentIndex + 1]
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * visit.ratio,
    longitude: start.longitude + (end.longitude - start.longitude) * visit.ratio,
  }
}

/** Clip by occurrence anchors, never by stop ID or by connecting a station to the road. */
function ridePoints(ride: Ride): Coordinate[] {
  const { route, boardingIndex, alightingIndex } = ride
  const reverse = boardingIndex > alightingIndex
  const first = route.visits[Math.min(boardingIndex, alightingIndex)]
  const last = route.visits[Math.max(boardingIndex, alightingIndex)]
  const firstPosition = first.segmentIndex + first.ratio
  const lastPosition = last.segmentIndex + last.ratio
  const points = [anchor(route, first)]
  for (let index = Math.floor(firstPosition) + 1; index < lastPosition; index += 1) {
    points.push(copyPoint(route.points[index]))
  }
  points.push(anchor(route, last))
  return reverse ? points.reverse() : points
}

function toLeg(ride: Ride): TransitJourneyLeg {
  const { route, boardingIndex, alightingIndex } = ride
  const visits = route.visits.slice(Math.min(boardingIndex, alightingIndex), Math.max(boardingIndex, alightingIndex) + 1)
  if (boardingIndex > alightingIndex) visits.reverse()
  return {
    routeId: route.id,
    routeName: route.name,
    color: route.color,
    directionId: boardingIndex < alightingIndex ? 'forward' : 'reverse',
    boardingStopId: route.visits[boardingIndex].stopId,
    alightingStopId: route.visits[alightingIndex].stopId,
    boardingVisitIndex: boardingIndex,
    alightingVisitIndex: alightingIndex,
    stopIds: visits.filter(isAutomaticBoardingVisit).map((visit) => visit.stopId),
    points: ridePoints(ride),
    distanceMeters: ride.distanceMeters,
  }
}

function rideWarnings(ride: Ride): string[] {
  const warnings = [...ride.route.warnings]
  const first = Math.min(ride.boardingIndex, ride.alightingIndex)
  const last = Math.max(ride.boardingIndex, ride.alightingIndex)
  for (const visit of ride.route.visits.slice(first, last + 1)) {
    if (!isAutomaticBoardingVisit(visit)) {
      warnings.push(`本区段含待核对位置（偏移约 ${Math.round(visit.offsetMeters)} 米），暂不作为本线路自动上下车或换乘点。`)
    }
  }
  return warnings
}

/** Static plans cover only the published open path and at most one exact-ID transfer. */
export function createTransitJourneyService(dataset: TransitDataset): TransitJourneyService {
  // Keep factory inputs and returned map geometry from becoming mutable shared state.
  const hasSourceStops = dataset.stops.length > 0
  const routes = dataset.routes.map((route) => ({
    ...route,
    points: route.points.map(copyPoint),
    visits: route.visits.map((visit) => ({ ...visit })),
    warnings: [...route.warnings],
  }))
  const currentStopIds = new Set(routes.flatMap((route) => route.visits.map((visit) => visit.stopId)))
  const usedStops = new Set(routes.flatMap((route) => route.visits.filter(isAutomaticBoardingVisit).map((visit) => visit.stopId)))
  const stops = dataset.stops.filter((stop) => usedStops.has(stop.id)).map((stop) => ({ ...stop, coordinate: copyPoint(stop.coordinate) }))
  const stopsById = new Map(stops.map((stop) => [stop.id, stop]))
  const ridesByOrigin = new Map<string, Map<string, Ride[]>>()
  for (const route of routes) {
    for (let boardingIndex = 0; boardingIndex < route.visits.length; boardingIndex += 1) {
      const boarding = route.visits[boardingIndex]
      if (!isAutomaticBoardingVisit(boarding) || !stopsById.has(boarding.stopId)) continue
      for (let alightingIndex = 0; alightingIndex < route.visits.length; alightingIndex += 1) {
        const alighting = route.visits[alightingIndex]
        const distanceMeters = Math.abs(alighting.mileageMeters - boarding.mileageMeters)
        if (!isAutomaticBoardingVisit(alighting) || boarding.stopId === alighting.stopId ||
          !stopsById.has(alighting.stopId) || distanceMeters <= 1) continue
        let destinations = ridesByOrigin.get(boarding.stopId)
        if (!destinations) ridesByOrigin.set(boarding.stopId, destinations = new Map())
        let rides = destinations.get(alighting.stopId)
        if (!rides) destinations.set(alighting.stopId, rides = [])
        rides.push({ route, boardingIndex, alightingIndex, distanceMeters })
      }
    }
  }

  function candidates(endpoint: TransitJourneyEndpoint): { candidates: Candidate[]; message: string } {
    if (endpoint?.kind === 'stop') {
      const stop = stopsById.get(endpoint.stopId)
      return stop ? { candidates: [{ stop, distanceMeters: 0 }], message: '' } :
        { candidates: [], message: currentStopIds.has(endpoint.stopId) ?
          '所选站点的位置待核对，暂不作为其线路自动上下车点，请重新选择。' :
          '所选站点不在当前公布线路中，请重新选择。' }
    }
    if (endpoint?.kind !== 'coordinate' || !isCoordinate(endpoint.coordinate)) {
      return { candidates: [], message: '地点坐标无效，请重新选择或重新定位。' }
    }
    const nearby = stops.map((stop) => ({ stop, distanceMeters: distanceBetween(endpoint.coordinate, stop.coordinate) }))
      .filter((candidate) => candidate.distanceMeters <= MAX_CONNECTION_METERS)
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.stop.id.localeCompare(b.stop.id))
      .slice(0, MAX_CANDIDATES)
    return { candidates: nearby, message: nearby.length ? '' : '地点不在服务范围内：800 米内没有当前公布站点。' }
  }

  return {
    plan(origin, destination) {
      if (!routes.length || !hasSourceStops) return { journeys: [], message: '暂无当前线路数据，不能提供乘车方案。' }
      if (!stops.length) return { journeys: [], message: '当前公布站点的位置仍待核对，暂不能生成自动上下车方案。' }
      const from = candidates(origin)
      const to = candidates(destination)
      if (from.message || to.message) return { journeys: [], message: from.message || to.message }
      const originCoordinate = origin.kind === 'coordinate' ? origin.coordinate : from.candidates[0].stop.coordinate
      const destinationCoordinate = destination.kind === 'coordinate' ? destination.coordinate : to.candidates[0].stop.coordinate
      // A positional no-trip check does not merge physical stop IDs or transfer nodes.
      if (distanceBetween(originCoordinate, destinationCoordinate) <= 1) {
        return { journeys: [], message: '起点和终点位置基本重合，无需乘车，请核对所选位置。' }
      }
      const journeys = new Map<string, TransitJourney>()
      function add(rides: Ride[], boarding: Candidate, alighting: Candidate) {
        const id = JSON.stringify(rides.map((ride) => [ride.route.id, ride.boardingIndex, ride.alightingIndex]))
        if (journeys.has(id)) return
        journeys.set(id, {
          id,
          legs: rides.map(toLeg),
          accessDistanceMeters: boarding.distanceMeters,
          egressDistanceMeters: alighting.distanceMeters,
          rideDistanceMeters: rides.reduce((sum, ride) => sum + ride.distanceMeters, 0),
          ...(rides.length === 2 ? { transferStopId: rides[0].route.visits[rides[0].alightingIndex].stopId } : {}),
          warnings: [...new Set(rides.flatMap(rideWarnings))],
        })
      }
      for (const boarding of from.candidates) {
        const outbound = ridesByOrigin.get(boarding.stop.id)
        if (!outbound) continue
        for (const alighting of to.candidates) {
          if (boarding.stop.id === alighting.stop.id) continue
          for (const direct of outbound.get(alighting.stop.id) ?? []) add([direct], boarding, alighting)
          for (const [transferStopId, firstRides] of outbound) {
            const secondRides = ridesByOrigin.get(transferStopId)?.get(alighting.stop.id) ?? []
            for (const first of firstRides) for (const second of secondRides) {
              if (first.route.id !== second.route.id) add([first, second], boarding, alighting)
            }
          }
        }
      }
      const ranked = [...journeys.values()].sort((a, b) => a.legs.length - b.legs.length ||
        (a.accessDistanceMeters + a.egressDistanceMeters) - (b.accessDistanceMeters + b.egressDistanceMeters) ||
        a.rideDistanceMeters - b.rideDistanceMeters || a.id.localeCompare(b.id)).slice(0, MAX_JOURNEYS)
      return {
        journeys: ranked,
        message: ranked.length ? '按公布路径生成候选，实际运营方向尚待核对；按换乘次数、接驳直线距离和乘车里程排序。' :
          '当前公布路径范围内没有直达或一次换乘方案。',
      }
    },
  }
}

export const transitJourneyService = createTransitJourneyService(currentTransitRepository.getDataset())
