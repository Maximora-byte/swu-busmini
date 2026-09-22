import assert from 'node:assert/strict'
import test from 'node:test'
import type { BusDirection, BusRoute, BusStop, CampusPOI } from '../miniprogram/models/index'
import { createTransferRoutingService } from '../miniprogram/services/navigation/transfer-routing.service'
import { createNavigationPlannerService } from '../miniprogram/services/navigation/navigation-planner.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticPoiRepository } from '../miniprogram/services/repository/poi.repository'
import { createStaticRouteRepository } from '../miniprogram/services/repository/route.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

function direction(name: string, stopIds: string[], isLoop = false, allowedRepeatedStopIds?: string[]): BusDirection {
  return { name, stopIds, isLoop, allowedRepeatedStopIds }
}

function route(id: string, directions: BusDirection[]): BusRoute {
  return {
    id, name: id, serviceType: 'flexible_campus_bus', allowIntermediateStop: true,
    dataStatus: 'needs_review', directions,
  }
}

function poi(id: string, relatedStopIds: string[]): CampusPOI {
  return { id, name: id, aliases: [], relatedStopIds, category: 'other', dataStatus: 'needs_review' }
}

function setup(routes: BusRoute[], originStops = ['a'], destinationStops = ['d']) {
  const stopIds = new Set([...originStops, ...destinationStops,
    ...routes.flatMap((item) => item.directions.flatMap((item) => item.stopIds))])
  const data: BusStop[] = [...stopIds].map((id) => ({ id, name: id, aliases: [], coordinate: null }))
  const stops = createStaticBusStopRepository(data)
  const pois = createStaticPoiRepository([poi('origin', originStops), poi('destination', destinationStops)])
  const catalog = createRouteCatalogService(createStaticRouteRepository(routes), stops)
  return {
    service: createTransferRoutingService(pois, catalog),
    planner: createNavigationPlannerService(catalog, stops, pois),
  }
}

test('one-transfer routing joins two different routes at the exact shared reference stop', () => {
  const { service } = setup([
    route('r1', [direction('outbound', ['a', 'b', 'x'])]),
    route('r2', [direction('outbound', ['x', 'c', 'd'])]),
  ])
  const [result] = service.findOneTransferRoutes('origin', 'destination')
  assert.equal(result.transferStopId, 'x')
  assert.equal(result.dataStatus, 'needs_review')
  assert.deepEqual(result.legs.map((leg) => leg.stopIds), [['a', 'b', 'x'], ['x', 'c', 'd']])
  assert.deepEqual(result.legs.map((leg) => leg.routeId), ['r1', 'r2'])
  assert.equal(result.legs[0].originStopId, 'a')
  assert.equal(result.legs[1].destinationStopId, 'd')
})

test('one-transfer routing uses only the correct ordered direction of each leg', () => {
  const { service } = setup([
    route('r1', [direction('wrong', ['x', 'a']), direction('reverse', ['a', 'x'])]),
    route('r2', [direction('wrong', ['d', 'x']), direction('reverse', ['x', 'd'])]),
  ])
  const results = service.findOneTransferRoutes('origin', 'destination')
  assert.equal(results.length, 1)
  assert.deepEqual(results[0].legs.map((leg) => leg.directionId), ['reverse', 'reverse'])
})

test('one-transfer routing returns no connection for disjoint stops or wrong direction', () => {
  const disconnected = setup([
    route('r1', [direction('outbound', ['a', 'x'])]),
    route('r2', [direction('outbound', ['y', 'd'])]),
  ])
  assert.deepEqual(disconnected.service.findOneTransferRoutes('origin', 'destination'), [])
  const wrongDirection = setup([
    route('r1', [direction('outbound', ['x', 'a'])]),
    route('r2', [direction('outbound', ['x', 'd'])]),
  ])
  assert.deepEqual(wrongDirection.service.findOneTransferRoutes('origin', 'destination'), [])
})

test('one-transfer routing keeps distinct shared-stop choices in deterministic order', () => {
  const routes = [
    route('r1', [direction('outbound', ['a', 'x', 'y'])]),
    route('r2', [direction('outbound', ['x', 'y', 'd'])]),
  ]
  const first = setup(routes).service.findOneTransferRoutes('origin', 'destination')
  const reversedInput = setup([...routes].reverse()).service.findOneTransferRoutes('origin', 'destination')
  assert.equal(first.length, 2)
  assert.deepEqual(new Set(first.map((result) => result.transferStopId)), new Set(['x', 'y']))
  assert.deepEqual(first, reversedInput)
})

test('one-transfer routing supports one wrap on either explicit closed loop', () => {
  const { service } = setup([
    route('r1', [direction('loop', ['x', 'b', 'a', 'x'], true)]),
    route('r2', [direction('loop', ['d', 'c', 'x', 'd'], true)]),
  ])
  const [result] = service.findOneTransferRoutes('origin', 'destination')
  assert.deepEqual(result.legs.map((leg) => leg.stopIds), [['a', 'x'], ['x', 'd']])
  assert.equal(service.findOneTransferRoutes('origin', 'destination').length, 1)
})

test('repeated stop occurrences remain finite and choose a nonzero ordered leg', () => {
  const { service } = setup([
    route('r1', [direction('loop', ['z', 'x', 'a', 'x', 'b', 'z'], true, ['x'])]),
    route('r2', [direction('outbound', ['x', 'd'])]),
  ])
  const results = service.findOneTransferRoutes('origin', 'destination')
  assert.equal(results.length, 1)
  assert.deepEqual(results[0].legs[0].stopIds, ['a', 'x'])
  assert.ok(results[0].legs.every((leg) => leg.originStopId !== leg.destinationStopId))
})

test('same route and zero-length legs are never transfer recommendations', () => {
  const oneRoute = setup([route('r1', [direction('forward', ['a', 'x', 'd'])])])
  assert.deepEqual(oneRoute.service.findOneTransferRoutes('origin', 'destination'), [])
  const zeroFirst = setup([
    route('r1', [direction('forward', ['z', 'a'])]),
    route('r2', [direction('forward', ['a', 'd'])]),
  ])
  assert.deepEqual(zeroFirst.service.findOneTransferRoutes('origin', 'destination'), [])
  const zeroSecond = setup([
    route('r1', [direction('forward', ['a', 'd'])]),
    route('r2', [direction('forward', ['d', 'z'])]),
  ])
  assert.deepEqual(zeroSecond.service.findOneTransferRoutes('origin', 'destination'), [])
})

test('POI stop sets support multiple references and missing references have no results', () => {
  const { service } = setup([
    route('r1', [direction('forward', ['a2', 'x'])]),
    route('r2', [direction('forward', ['x', 'd2'])]),
  ], ['a', 'a2'], ['d', 'd2'])
  assert.equal(service.findOneTransferRoutes('origin', 'destination')[0].legs[0].originStopId, 'a2')
  assert.deepEqual(setup([], [], ['d']).service.findOneTransferRoutes('origin', 'destination'), [])
  assert.throws(() => service.findOneTransferRoutes('missing', 'destination'), /未找到起点/)
  assert.throws(() => service.findOneTransferRoutes('origin', 'missing'), /未找到终点/)
  assert.deepEqual(service.findOneTransferRoutes('origin', 'origin'), [])
})

test('transfer results are capped at six deterministic candidates', () => {
  const routes = Array.from({ length: 8 }, (_, index) =>
    route(`r${index}`, [direction('forward', ['a', `x${index}`])]))
  routes.push(route('destination', [direction('forward', [...Array.from({ length: 8 }, (_, index) => `x${index}`), 'd'])]))
  const first = setup(routes).service.findOneTransferRoutes('origin', 'destination')
  const second = setup([...routes].reverse()).service.findOneTransferRoutes('origin', 'destination')
  assert.equal(first.length, 6)
  assert.deepEqual(first, second)
})

test('planner retains direct plans and exposes separate transfer views with per-leg map targets', () => {
  const { planner } = setup([
    route('direct', [direction('forward', ['a', 'd'])]),
    route('r1', [direction('forward', ['a', 'x'])]),
    route('r2', [direction('forward', ['x', 'd'])]),
  ])
  const result = planner.plan('poi:origin', 'poi:destination')
  assert.deepEqual(result.plans, [{
    id: 'direct:forward', routeId: 'direct', routeName: 'direct', directionId: 'forward',
    boardingText: 'a', destinationText: 'd', pathText: 'a → d',
    note: '支持沿途停靠，请结合现场情况确认安全上下车位置。',
  }])
  assert.equal(result.transferPlans.length, 1)
  assert.equal(result.transferPlans[0].transferStopName, 'x')
  assert.deepEqual(result.transferPlans[0].legs.map((leg) => [leg.routeId, leg.directionId]), [['r1', 'forward'], ['r2', 'forward']])
  assert.match(result.transferPlans[0].note, /待人工复核/)
  assert.deepEqual(planner.plan(undefined, 'poi:destination').transferPlans, [])
  assert.deepEqual(planner.plan('poi:origin', 'poi:origin').transferPlans, [])
})

test('unnecessary switching is omitted when either candidate route already connects the exact endpoints', () => {
  const firstIsDirect = setup([
    route('r1', [direction('forward', ['a', 'x', 'd'])]),
    route('r2', [direction('forward', ['x', 'd'])]),
  ])
  assert.deepEqual(firstIsDirect.service.findOneTransferRoutes('origin', 'destination'), [])
  const secondIsDirect = setup([
    route('r1', [direction('forward', ['a', 'x'])]),
    route('r2', [direction('loop', ['d', 'a', 'x', 'd'], true)]),
  ])
  assert.deepEqual(secondIsDirect.service.findOneTransferRoutes('origin', 'destination'), [])
})

test('direct planner chooses the shortest reference segment between repeated stop occurrences', () => {
  const { planner } = setup([
    route('direct', [direction('loop', ['z', 'a', 'b', 'a', 'd', 'z'], true, ['a'])]),
  ])
  const result = planner.plan('poi:origin', 'poi:destination')
  assert.equal(result.plans.length, 1)
  assert.equal(result.plans[0].pathText, 'a → d')
})
