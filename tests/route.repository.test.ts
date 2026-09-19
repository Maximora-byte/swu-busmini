import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  busStopRepository,
  createStaticBusStopRepository,
} from '../miniprogram/services/repository/bus-stop.repository'
import {
  createStaticRouteRepository,
  routeRepository,
} from '../miniprogram/services/repository/route.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

const FORWARD_STOP_IDS = [
  'gate_1',
  'library',
  'building_8',
  'tjb',
  'gate_5',
]

test('loads only route 1 with independent forward and reverse directions', () => {
  const routes = routeRepository.getAll()

  assert.equal(routes.length, 1)
  assert.equal(routes[0]?.id, 'route_1')
  assert.deepEqual(routes[0]?.directions, [
    { name: '正向', stopIds: FORWARD_STOP_IDS },
    { name: '反向', stopIds: [...FORWARD_STOP_IDS].reverse() },
  ])
})

test('route catalog resolves stop details and reports pending markers', () => {
  const service = createRouteCatalogService(
    routeRepository,
    busStopRepository,
  )

  const details = service.getRouteDetails('route_1', '正向')

  assert.deepEqual(
    details.stops.map(({ name }) => name),
    ['一号门', '图书馆', '八教', '田家炳', '五号门'],
  )
  assert.equal(details.mappableStops.length, 0)
  assert.equal(details.pendingCoordinateCount, 5)
})

test('route catalog rejects a route that references an unknown stop', () => {
  const invalidRoutes = createStaticRouteRepository([
    {
      id: 'invalid_route',
      name: '无效线路',
      directions: [
        {
          name: '正向',
          stopIds: ['gate_1', 'missing_stop'],
        },
      ],
    },
  ])
  const service = createRouteCatalogService(invalidRoutes, busStopRepository)

  assert.throws(
    () => service.getRouteDetails('invalid_route'),
    /方向 正向 引用了未定义站点: missing_stop/,
  )
})

test('route catalog validates every direction before returning details', () => {
  const invalidRoutes = createStaticRouteRepository([
    {
      id: 'partially_invalid_route',
      name: '部分无效线路',
      directions: [
        {
          name: '正向',
          stopIds: ['gate_1', 'library'],
        },
        {
          name: '反向',
          stopIds: ['library', 'missing_reverse_stop'],
        },
      ],
    },
  ])
  const service = createRouteCatalogService(invalidRoutes, busStopRepository)

  assert.throws(
    () => service.getRouteDetails('partially_invalid_route', '正向'),
    /方向 反向 引用了未定义站点: missing_reverse_stop/,
  )
})

test('route catalog rejects duplicate stopIds within one direction', () => {
  const duplicateRoutes = createStaticRouteRepository([
    {
      id: 'duplicate_route',
      name: '重复站点线路',
      directions: [
        {
          name: '正向',
          stopIds: ['gate_1', 'library', 'gate_1'],
        },
      ],
    },
  ])
  const service = createRouteCatalogService(duplicateRoutes, busStopRepository)

  assert.throws(
    () => service.getRouteDetails('duplicate_route'),
    /方向 正向 存在重复 stopId: gate_1/,
  )
})

test('route catalog exposes only verified coordinates to the map layer', () => {
  const stops = createStaticBusStopRepository([
    {
      id: 'verified_stop',
      name: '已校准站点',
      aliases: [],
      coordinate: {
        latitude: 29.8,
        longitude: 106.4,
        verified: true,
      },
    },
    {
      id: 'pending_stop',
      name: '待校准站点',
      aliases: [],
      coordinate: null,
      coordinateTodo: 'TODO: waiting for field verification',
    },
  ])
  const routes = createStaticRouteRepository([
    {
      id: 'calibration_test',
      name: '校准测试',
      directions: [
        {
          name: '正向',
          stopIds: ['verified_stop', 'pending_stop'],
        },
      ],
    },
  ])
  const service = createRouteCatalogService(routes, stops)

  const details = service.getRouteDetails('calibration_test')

  assert.deepEqual(
    details.mappableStops.map(({ id }) => id),
    ['verified_stop'],
  )
  assert.equal(details.pendingCoordinateCount, 1)
})
