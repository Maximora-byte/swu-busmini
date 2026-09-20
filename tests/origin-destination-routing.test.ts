import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type {
  BusRoute,
  BusStop,
  CampusPOI,
  RouteServiceType,
} from '../miniprogram/models/index'
import {
  createOriginDestinationService,
  FLEXIBLE_ORIGIN_DESTINATION_NOTE,
} from '../miniprogram/services/navigation/origin-destination.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticPoiRepository } from '../miniprogram/services/repository/poi.repository'
import { createStaticRouteRepository } from '../miniprogram/services/repository/route.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

const stopIds = ['origin_a', 'origin_b', 'destination_a', 'other'] as const

const stops: readonly BusStop[] = stopIds.map((id) => ({
  id,
  name: id,
  aliases: [],
  coordinate: null,
}))

const originPoi: CampusPOI = {
  id: 'origin',
  name: '起点',
  aliases: [],
  category: 'other',
  relatedStopIds: ['origin_a'],
  dataStatus: 'verified',
}

const destinationPoi: CampusPOI = {
  id: 'destination',
  name: '终点',
  aliases: [],
  category: 'other',
  relatedStopIds: ['destination_a'],
  dataStatus: 'verified',
}

function createRoute(
  id: string,
  directions: BusRoute['directions'],
  serviceType: RouteServiceType = 'fixed_stop',
): BusRoute {
  return {
    id,
    name: id,
    serviceType,
    allowIntermediateStop: serviceType === 'flexible_campus_bus',
    dataStatus: 'needs_review',
    directions,
  }
}

function createService(
  routes: readonly BusRoute[],
  pois: readonly CampusPOI[] = [originPoi, destinationPoi],
) {
  const stopRepository = createStaticBusStopRepository(stops)
  const routeRepository = createStaticRouteRepository(routes)
  const poiRepository = createStaticPoiRepository(pois)
  const catalog = createRouteCatalogService(routeRepository, stopRepository)

  return createOriginDestinationService(poiRepository, catalog)
}

test('returns a route when origin precedes destination in one direction', () => {
  const service = createService([
    createRoute('route_direct', [
      {
        name: '正向',
        isLoop: false,
        stopIds: ['origin_a', 'other', 'destination_a'],
      },
    ]),
  ])

  const result = service.findDirectRoutes('origin', 'destination')

  assert.equal(result.length, 1)
  assert.deepEqual(result[0], {
    originPoiId: 'origin',
    destinationPoiId: 'destination',
    routeId: 'route_direct',
    routeName: 'route_direct',
    originStopIds: ['origin_a'],
    destinationStopIds: ['destination_a'],
    directions: ['正向'],
    serviceType: 'fixed_stop',
    dataStatus: 'needs_review',
    notes: [],
  })
})

test('returns every route that directly connects both POIs', () => {
  const service = createService([
    createRoute('route_a', [
      {
        name: 'A方向',
        isLoop: false,
        stopIds: ['origin_a', 'destination_a'],
      },
    ]),
    createRoute('route_b', [
      {
        name: 'B方向',
        isLoop: false,
        stopIds: ['origin_a', 'other', 'destination_a'],
      },
    ]),
  ])

  assert.deepEqual(
    service
      .findDirectRoutes('origin', 'destination')
      .map(({ routeId }) => routeId),
    ['route_a', 'route_b'],
  )
})

test('only returns the direction where origin precedes destination', () => {
  const service = createService([
    createRoute('route_bidirectional', [
      {
        name: '正向',
        isLoop: false,
        stopIds: ['destination_a', 'origin_a'],
      },
      {
        name: '反向',
        isLoop: false,
        stopIds: ['origin_a', 'destination_a'],
      },
    ]),
  ])

  const [result] = service.findDirectRoutes('origin', 'destination')

  assert.deepEqual(result?.directions, ['反向'])
})

test('returns an empty list when no route connects the POIs in order', () => {
  const service = createService([
    createRoute('route_wrong_order', [
      {
        name: '单向',
        isLoop: false,
        stopIds: ['destination_a', 'origin_a'],
      },
    ]),
  ])

  assert.deepEqual(service.findDirectRoutes('origin', 'destination'), [])
})

test('adds a confirmation note for a flexible campus bus route', () => {
  const service = createService([
    createRoute(
      'route_flexible',
      [
        {
          name: '图示方向',
          isLoop: false,
          stopIds: ['origin_a', 'destination_a'],
        },
      ],
      'flexible_campus_bus',
    ),
  ])

  const [result] = service.findDirectRoutes('origin', 'destination')

  assert.equal(result?.serviceType, 'flexible_campus_bus')
  assert.deepEqual(result?.notes, [FLEXIBLE_ORIGIN_DESTINATION_NOTE])
})

test('throws clear errors when either POI does not exist', () => {
  const service = createService([])

  assert.throws(
    () => service.findDirectRoutes('missing_origin', 'destination'),
    /未找到起点校园地点: missing_origin/,
  )
  assert.throws(
    () => service.findDirectRoutes('origin', 'missing_destination'),
    /未找到终点校园地点: missing_destination/,
  )
})

test('returns an empty list when either POI has no related stops', () => {
  const service = createService([], [
    { ...originPoi, relatedStopIds: [] },
    destinationPoi,
  ])

  assert.deepEqual(service.findDirectRoutes('origin', 'destination'), [])
})
