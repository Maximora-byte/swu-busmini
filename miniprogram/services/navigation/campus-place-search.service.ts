import type { Coordinate } from '../../models/index'
import type { TransitDataset } from '../../models/current-transit'
import { distanceBetween } from '../../utils/distance'
import { createTransitStopSearchService } from './transit-stop-search.service'
import { isAutomaticBoardingVisit } from './transit-visit-policy'
import { hasConflictingCampusIdentity } from './campus-search-identity'

export interface CampusMapPlace {
  id: string
  name: string
  aliases: string[]
  coordinate: Coordinate | null
  sourceLabel: string
  coordinateKind: 'mapped-node' | 'area-center' | 'native-selection' | 'unlocated-guide'
  details?: string
}

export interface CampusSearchSuggestion {
  id: string
  kind: 'stop' | 'place'
  stopId?: string
  placeId?: string
  name: string
  label: string
  routeNames: string[]
  coordinate: Coordinate | null
  sourceLabel: string
  details?: string
  nearbyStops: { stopId: string; name: string; distanceMeters: number; routeNames: string[] }[]
}

function validCoordinate(value: Coordinate | null | undefined): value is Coordinate {
  return !!value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180
}

function normalize(value: string): string {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  return value.toLowerCase()
    .replace(/[！-～]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[零〇一二两三四五六七八九十]+/g, (number) => {
      if (!number.includes('十')) return [...number].map((digit) => digits[digit]).join('')
      const [tens, ones] = number.split('十')
      return String((tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0))
    })
    .replace(/第(?=\d)/g, '')
    .replace(/教学(?:大)?楼/g, '教')
    .replace(/(?:号|大|校)门/g, '门')
    .replace(/[\s·、，,。．（）()【】\[\]_-]/g, '')
}

/** One edit (including an adjacent transposition), with no fuzzy expansion. */
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, changes = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue }
    if (++changes > 1) return false
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2 }
    else if (a.length > b.length) i += 1
    else if (a.length < b.length) j += 1
    else { i += 1; j += 1 }
  }
  return changes + a.length - i + b.length - j <= 1
}

function matchRank(query: string, term: string, canonical: boolean): number {
  if (hasConflictingCampusIdentity(query, term)) return Infinity
  const queryNumbers: string[] = query.match(/\d+/g) ?? []
  const termNumbers: string[] = term.match(/\d+/g) ?? []
  if (queryNumbers.some((number) => !termNumbers.includes(number))) return Infinity
  if (query === term) return canonical ? 0 : 1
  if (term.startsWith(query)) return canonical ? 2 : 3
  if (term.includes(query)) return canonical ? 4 : 5
  return query.length >= 3 && queryNumbers.length === termNumbers.length && oneEdit(query, term) ? 6 : Infinity
}

/** Caller-supplied GCJ-02 reference positions; proximity is straight-line distance, never walking or an ETA. */
export function createCampusPlaceSearchService(dataset: TransitDataset, places: readonly CampusMapPlace[]) {
  const snapshot: TransitDataset = {
    ...dataset,
    stops: dataset.stops.filter((stop) => validCoordinate(stop.coordinate)).map((stop) => ({ ...stop, coordinate: { ...stop.coordinate } })),
    routes: dataset.routes.map((route) => ({
      ...route, points: route.points.map((point) => ({ ...point })), warnings: [...route.warnings],
      visits: route.visits.map((visit) => ({ ...visit })),
    })),
  }
  const stopsById = new Map(snapshot.stops.map((stop) => [stop.id, stop]))
  const stopSearch = createTransitStopSearchService(snapshot)
  const eligibleStops = [...stopsById.values()].flatMap((stop) => {
    const routeNames = [...new Set(snapshot.routes.filter((route) => route.visits.some((visit) =>
      visit.stopId === stop.id && isAutomaticBoardingVisit(visit))).map(({ name }) => name))]
    return routeNames.length ? [{ ...stop, routeNames }] : []
  })
  const placeEntries = places.filter(({ coordinate, coordinateKind }) => validCoordinate(coordinate) ||
    (coordinate === null && coordinateKind === 'unlocated-guide')).map((item) => ({
    ...item, aliases: [...item.aliases], coordinate: item.coordinate ? { ...item.coordinate } : null,
    terms: [...new Set([item.name, ...item.aliases].map(normalize))], normalizedName: normalize(item.name),
  }))

  function nearby(coordinate: Coordinate): CampusSearchSuggestion['nearbyStops'] {
    if (!validCoordinate(coordinate)) return []
    return eligibleStops.map((stop) => ({
      stopId: stop.id, name: stop.name, distanceMeters: distanceBetween(coordinate, stop.coordinate), routeNames: [...stop.routeNames],
    })).filter(({ distanceMeters }) => distanceMeters <= 800)
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.stopId.localeCompare(b.stopId))
      .slice(0, 3)
  }

  return {
    search(keyword: string): CampusSearchSuggestion[] {
      if (typeof keyword !== 'string' || keyword.length > 64) return []
      const query = normalize(keyword)
      if (!query) return []
      const rankedStops = stopSearch.search(keyword).map(({ matchRank: rank = 6, ...suggestion }, order) => {
        const stop = stopsById.get(suggestion.stopId)!
        const result: CampusSearchSuggestion = {
          ...suggestion, id: `stop:${stop.id}`, kind: 'stop', coordinate: { ...stop.coordinate },
          sourceLabel: snapshot.source, nearbyStops: nearby(stop.coordinate),
        }
        return { rank, order, result }
      })
      const rankedPlaces = placeEntries.flatMap((entry, order) => {
        if (hasConflictingCampusIdentity(query, entry.normalizedName)) return []
        const rank = Math.min(...entry.terms.map((term) => matchRank(query, term, term === entry.normalizedName)))
        if (!Number.isFinite(rank)) return []
        const nearbyStops = entry.coordinate ? nearby(entry.coordinate) : []
        const result: CampusSearchSuggestion = {
          id: `place:${entry.id}`, kind: 'place', placeId: entry.id, name: entry.name,
          label: `${entry.name} · ${entry.sourceLabel}${entry.coordinate ? '' : ' · 暂无坐标，需选位置'}`,
          coordinate: entry.coordinate ? { ...entry.coordinate } : null, sourceLabel: entry.sourceLabel,
          ...(entry.details === undefined ? {} : { details: entry.details }),
          routeNames: [...new Set(nearbyStops.flatMap(({ routeNames }) => routeNames))], nearbyStops,
        }
        return [{ rank, order: snapshot.stops.length + order, result }]
      })
      return [...rankedStops, ...rankedPlaces].sort((a, b) => a.rank - b.rank || a.order - b.order)
        .slice(0, 12).map(({ result }) => result)
    },
    nearby,
  }
}
