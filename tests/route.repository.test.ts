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

const ROUTE_1_FORWARD_STOP_IDS = [
  'jingguanyuan',
  'gate_6',
  'gate_2',
  'building_8',
  'tianjiabing',
  'yuanding',
  'gate_5',
]

const MAP_FORWARD_STOP_IDS: Readonly<Record<string, readonly string[]>> = {
  route_1: ROUTE_1_FORWARD_STOP_IDS,
  route_2: [
    'jingguanyuan',
    'gate_6',
    'gate_2',
    'building_8',
    'tianjiabing',
    'xishijie',
    'gate_5',
  ],
  route_3: [
    'zhuyuan',
    'gate_2',
    'building_5',
    'meiyuan',
    'juyuan',
    'gate_5',
  ],
  route_4: [
    'gate_2',
    'canteen_2',
    'geosciences',
    'foreign_languages',
    'building_26',
    'meiyuan',
    'juyuan',
  ],
  route_5: ['gate_2', 'building_8', 'tianjiabing', 'yuanding', 'gate_5'],
  route_6: [
    'zhuyuan',
    'gate_2',
    'meiyuan',
    'juyuan',
    'tianjiabing',
    'building_8',
    'gate_2',
    'zhuyuan',
  ],
  route_7: [
    'gate_2',
    'geosciences',
    'building_5',
    'building_26',
    'meiyuan',
    'juyuan',
    'tianjiabing',
    'liyuan',
    'auditorium',
    'gate_2',
  ],
  route_8: [
    'music_school',
    'building_8',
    'tianjiabing',
    'juyuan',
    'meiyuan',
    'foreign_languages',
    'music_school',
  ],
  route_9: [
    'zhuyuan',
    'gate_2',
    'building_8',
    'tianjiabing',
    'yuanding',
    'gate_5',
    'juyuan',
    'meiyuan',
    'zhongtu',
    'gate_2',
    'zhuyuan',
  ],
}

test('loads route 1 through route 9 with unique ids', () => {
  const routes = routeRepository.getAll()

  assert.deepEqual(
    routes.map(({ id }) => id),
    Array.from({ length: 9 }, (_, index) => `route_${index + 1}`),
  )
  assert.equal(new Set(routes.map(({ id }) => id)).size, 9)
})

test('corrects route 1 to the 2025 map sequence', () => {
  const route = routeRepository.findById('route_1')

  assert.deepEqual(route?.directions, [
    {
      name: '图示正向',
      isLoop: false,
      stopIds: ROUTE_1_FORWARD_STOP_IDS,
      allowedRepeatedStopIds: undefined,
    },
    {
      name: '图示反向',
      isLoop: false,
      stopIds: [...ROUTE_1_FORWARD_STOP_IDS].reverse(),
      allowedRepeatedStopIds: undefined,
    },
  ])
})

test('uses 二食堂 as route 4 second stop from the 2025 map', () => {
  const route = routeRepository.findById('route_4')
  assert.ok(route)

  assert.deepEqual(route.directions[0]?.stopIds, [
    'gate_2',
    'canteen_2',
    'geosciences',
    'foreign_languages',
    'building_26',
    'meiyuan',
    'juyuan',
  ])
  assert.equal(busStopRepository.findById('canteen_2')?.name, '二食堂')
  assert.equal(busStopRepository.findById('canteen_3'), undefined)
})

test('matches every route sequence visible in the 2025 map table', () => {
  for (const [routeId, expectedForwardStopIds] of Object.entries(
    MAP_FORWARD_STOP_IDS,
  )) {
    const route = routeRepository.findById(routeId)
    assert.ok(route, routeId)
    assert.deepEqual(route.directions[0]?.stopIds, expectedForwardStopIds, routeId)
    assert.deepEqual(
      route.directions[1]?.stopIds,
      [...expectedForwardStopIds].reverse(),
      `${routeId} reverse`,
    )
  }
})

test('resolves every route and every direction against the stop repository', () => {
  const catalog = createRouteCatalogService(routeRepository, busStopRepository)

  for (const route of catalog.getRoutes()) {
    for (const direction of route.directions) {
      const details = catalog.getRouteDetails(route.id, direction.name)
      assert.equal(details.stops.length, direction.stopIds.length)
    }
  }
})

test('the nine sourced routes reference 20 unique stops', () => {
  const referencedStopIds = new Set(
    routeRepository
      .getAll()
      .flatMap((route) => route.directions)
      .flatMap((direction) => direction.stopIds),
  )

  assert.equal(referencedStopIds.size, 20)
  assert.equal(referencedStopIds.has('gate_1'), false)
  assert.equal(referencedStopIds.has('library'), false)
})

test('reports all formal route stops as pending map markers', () => {
  const catalog = createRouteCatalogService(routeRepository, busStopRepository)

  for (const route of catalog.getRoutes()) {
    const details = catalog.getRouteDetails(route.id)
    assert.equal(details.mappableStops.length, 0, route.id)
    assert.equal(
      details.pendingCoordinateCount,
      new Set(details.direction.stopIds).size,
      route.id,
    )
  }
})

test('rejects duplicate route ids', () => {
  const duplicatedRoute = {
    id: 'duplicate_route',
    name: '重复线路',
    directions: [
      {
        name: '图示正向',
        isLoop: false,
        stopIds: ['gate_1', 'library'],
      },
    ],
  }

  assert.throws(
    () => createStaticRouteRepository([duplicatedRoute, duplicatedRoute]),
    /重复线路 id: duplicate_route/,
  )
})

test('rejects a route that references an undefined stop', () => {
  const invalidRoutes = createStaticRouteRepository([
    {
      id: 'invalid_route',
      name: '无效线路',
      directions: [
        {
          name: '图示正向',
          isLoop: false,
          stopIds: ['gate_1', 'missing_stop'],
        },
      ],
    },
  ])
  const catalog = createRouteCatalogService(invalidRoutes, busStopRepository)

  assert.throws(
    () => catalog.getRouteDetails('invalid_route'),
    /Route 无效线路 references unknown stop missing_stop/,
  )
})

test('rejects an undeclared duplicate stop within a direction', () => {
  const duplicateRoutes = createStaticRouteRepository([
    {
      id: 'duplicate_route',
      name: '重复站点线路',
      directions: [
        {
          name: '图示正向',
          isLoop: false,
          stopIds: ['gate_1', 'library', 'gate_1'],
        },
      ],
    },
  ])
  const catalog = createRouteCatalogService(duplicateRoutes, busStopRepository)

  assert.throws(
    () => catalog.getRouteDetails('duplicate_route'),
    /returns to its first stop but is not marked as a loop/,
  )
})

test('allows only the first and last duplicate for a simple loop', () => {
  const loopRoutes = createStaticRouteRepository([
    {
      id: 'simple_loop',
      name: '简单环线',
      directions: [
        {
          name: '图示顺序',
          isLoop: true,
          stopIds: ['gate_1', 'library', 'gate_1'],
        },
      ],
    },
  ])
  const catalog = createRouteCatalogService(loopRoutes, busStopRepository)

  assert.doesNotThrow(() => catalog.getRouteDetails('simple_loop'))
})

test('allows explicitly declared repeated stops in a sourced loop', () => {
  const catalog = createRouteCatalogService(routeRepository, busStopRepository)

  assert.doesNotThrow(() => catalog.getRouteDetails('route_6'))
  assert.doesNotThrow(() => catalog.getRouteDetails('route_9'))
})

test('rejects an unclosed direction marked as a loop', () => {
  const invalidLoop = createStaticRouteRepository([
    {
      id: 'open_loop',
      name: '未闭合环线',
      directions: [
        {
          name: '图示顺序',
          isLoop: true,
          stopIds: ['gate_1', 'library'],
        },
      ],
    },
  ])
  const catalog = createRouteCatalogService(invalidLoop, busStopRepository)

  assert.throws(
    () => catalog.getRouteDetails('open_loop'),
    /is marked as a loop but is not closed/,
  )
})

test('exposes only verified unique stops to the map layer', () => {
  const stops = createStaticBusStopRepository([
    {
      id: 'verified_stop',
      name: '已校准站点',
      aliases: [],
      coordinate: { latitude: 29.8, longitude: 106.4, verified: true },
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
      id: 'calibration_loop',
      name: '校准测试环线',
      directions: [
        {
          name: '图示顺序',
          isLoop: true,
          stopIds: ['verified_stop', 'pending_stop', 'verified_stop'],
        },
      ],
    },
  ])
  const catalog = createRouteCatalogService(routes, stops)

  const details = catalog.getRouteDetails('calibration_loop')

  assert.deepEqual(
    details.mappableStops.map(({ id }) => id),
    ['verified_stop'],
  )
  assert.equal(details.pendingCoordinateCount, 1)
})
