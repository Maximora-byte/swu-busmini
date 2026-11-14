import type { Coordinate } from '../../models/index'
import type { TransitVisitDirection } from '../../models/current-transit'
import type { CampusSearchSuggestion } from './campus-place-search.service'

export type EndpointField = 'origin' | 'destination'
export type EndpointMode = 'location' | 'search' | 'stop' | 'place' | 'map' | 'coordinate'
export interface EndpointState {
  mode: EndpointMode
  index: number
  query: string
  coordinate: Coordinate | null
  allowedVisits: TransitVisitDirection[] | null
  placeDetails: string
  nearbyStops: CampusSearchSuggestion['nearbyStops']
}
export type EndpointSelection = Pick<EndpointState, 'mode' | 'query'> & Partial<Omit<EndpointState, 'mode' | 'query'>>
type EndpointView<Field extends EndpointField> = Field extends EndpointField ? {
  [Key in keyof EndpointState as `${Field}${Capitalize<Key>}`]: EndpointState[Key]
} : never

// These adapters read page.data on demand; there is no second mutable endpoint store.
export function readEndpoint(view: EndpointView<'origin'> & EndpointView<'destination'>, field: EndpointField): EndpointState {
  return {
    mode: view[`${field}Mode`], index: view[`${field}Index`], query: view[`${field}Query`],
    coordinate: view[`${field}Coordinate`], allowedVisits: view[`${field}AllowedVisits`],
    placeDetails: view[`${field}PlaceDetails`], nearbyStops: view[`${field}NearbyStops`],
  }
}

export function endpointView<Field extends EndpointField>(field: Field, state: EndpointState): EndpointView<Field> {
  return {
    [`${field}Mode`]: state.mode, [`${field}Index`]: state.index, [`${field}Query`]: state.query,
    [`${field}Coordinate`]: state.coordinate, [`${field}AllowedVisits`]: state.allowedVisits,
    [`${field}PlaceDetails`]: state.placeDetails, [`${field}NearbyStops`]: state.nearbyStops,
  } as EndpointView<Field>
}

/** A new choice resets any coordinate, direction or place metadata it does not explicitly retain. */
export function transitionEndpoint(current: EndpointState, selection: EndpointSelection): EndpointState {
  return {
    mode: selection.mode, query: selection.query, index: selection.index ?? current.index,
    coordinate: selection.coordinate ? { ...selection.coordinate } : null,
    allowedVisits: selection.allowedVisits?.map((rule) => ({ ...rule })) ?? null,
    placeDetails: selection.placeDetails ?? '',
    nearbyStops: selection.nearbyStops?.map((stop) => ({ ...stop, routeNames: [...stop.routeNames] })) ?? [],
  }
}

export function swapEndpoints(origin: EndpointState, destination: EndpointState): { origin: EndpointState; destination: EndpointState } {
  return {
    origin: transitionEndpoint(destination, {
      ...destination, query: destination.mode === 'map' ? '地图所选起点' : destination.query,
    }),
    destination: transitionEndpoint(origin, {
      ...origin,
      mode: origin.mode === 'coordinate' ? 'map' : origin.mode === 'location' ? 'search' : origin.mode,
      query: origin.mode === 'location' ? '' : origin.mode === 'coordinate' ? '原定位位置' : origin.mode === 'map' ? '地图所选终点' : origin.query,
    }),
  }
}
