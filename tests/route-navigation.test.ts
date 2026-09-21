import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { BusStop } from '../miniprogram/models/index'
import { createRoutePolylineService } from '../miniprogram/services/map/route-polyline.service'
import {
  createRouteNavigationService,
  FLEXIBLE_ROUTE_NAVIGATION_NOTE,
} from '../miniprogram/services/navigation/route-navigation.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticRouteGeometryRepository } from '../miniprogram/services/repository/route-geometry.repository'
import { createStaticRouteRepository } from '../miniprogram/services/repository/route.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

const stops: readonly BusStop[] = [
  { id: 'stop_a', name: 'A站', aliases: [], coordinate: null },
  { id: 'stop_b', name: 'B站', aliases: [], coordinate: null },
]

function createNavigationService() {
  const stopRepository = createStaticBusStopRepository(stops)
  const routeRepository = createStaticRouteRepository([
    {
      id: 'route_with_geometry',
      name: '轨迹线路',
      serviceType: 'fixed_stop',
      allowIntermediateStop: false,
      dataStatus: 'verified',
      directions: [
        {
          name: '正向',
          isLoop: false,
          stopIds: ['stop_a', 'stop_b'],
        },
      ],
    },
    {
      id: 'route_without_geometry',
      name: '待采集线路',
      serviceType: 'flexible_campus_bus',
      allowIntermediateStop: true,
      dataStatus: 'needs_review',
      directions: [
        {
          name: '图示方向',
          isLoop: false,
          stopIds: ['stop_a', 'stop_b'],
        },
      ],
    },
  ])
  const geometryRepository = createStaticRouteGeometryRepository(
    [
      {
        routeId: 'route_with_geometry',
        directionId: '正向',
        source: 'field_survey',
        dataStatus: 'verified',
        points: [
          { latitude: 29.8, longitude: 106.4 },
          { latitude: 29.81, longitude: 106.41 },
        ],
      },
    ],
    routeRepository,
  )
  return createRouteNavigationService(
    createRouteCatalogService(routeRepository, stopRepository),
    geometryRepository,
  )
}

test('loads a route through the navigation service', () => {
  const navigation = createNavigationService().getRoute(
    'route_with_geometry',
  )

  assert.equal(navigation.routeId, 'route_with_geometry')
  assert.equal(navigation.routeName, '轨迹线路')
  assert.equal(navigation.directions.length, 1)
})

test('loads a selected direction as a navigation view model', () => {
  const navigation = createNavigationService().getRouteNavigation(
    'route_with_geometry',
    '正向',
  )

  assert.equal(navigation.directionId, '正向')
  assert.equal(navigation.directionName, '正向')
  assert.deepEqual(
    navigation.stops.map(({ stopId }) => stopId),
    ['stop_a', 'stop_b'],
  )
})

test('loads verified geometry for a route direction', () => {
  const navigation = createNavigationService().getRouteNavigation(
    'route_with_geometry',
    '正向',
  )

  assert.deepEqual(navigation.geometry, {
    routeId: 'route_with_geometry',
    directionId: '正向',
    source: 'field_survey',
    dataStatus: 'verified',
    points: [
      { latitude: 29.8, longitude: 106.4 },
      { latitude: 29.81, longitude: 106.41 },
    ],
  })
})

test('keeps known stop order available when geometry is absent', () => {
  const navigation = createNavigationService().getRouteNavigation(
    'route_without_geometry',
    '图示方向',
  )

  assert.equal(navigation.geometry, undefined)
  assert.deepEqual(
    navigation.stops.map(({ stopId }) => stopId),
    ['stop_a', 'stop_b'],
  )
})

test('returns the safe waiting note for a flexible campus bus', () => {
  const navigation = createNavigationService().getRouteNavigation(
    'route_without_geometry',
    '图示方向',
  )

  assert.equal(navigation.serviceType, 'flexible_campus_bus')
  assert.equal(navigation.allowIntermediateStop, true)
  assert.equal(navigation.note, FLEXIBLE_ROUTE_NAVIGATION_NOTE)
})

test('converts RouteGeometry to a WeChat map polyline', () => {
  const geometry = createNavigationService().getRouteNavigation(
    'route_with_geometry',
    '正向',
  ).geometry
  assert.ok(geometry)

  const polyline = createRoutePolylineService().toMapPolyline(geometry, {
    color: '#123456',
    width: 8,
  })

  assert.deepEqual(polyline, {
    points: [
      { latitude: 29.8, longitude: 106.4 },
      { latitude: 29.81, longitude: 106.41 },
    ],
    color: '#123456',
    width: 8,
  })
  assert.notEqual(polyline.points, geometry.points)
})
