import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { BusRoute, BusStop } from '../miniprogram/models/index'
import {
  type RouteDataSource,
  type RouteSourceAssignment,
  validateRoute,
  validateRouteData,
} from '../miniprogram/services/validation/route-data-validator'

const stops: readonly BusStop[] = ['a', 'b', 'c'].map((id) => ({
  id,
  name: id.toUpperCase(),
  aliases: [],
  coordinate: null,
}))

const sources: readonly RouteDataSource[] = [{ id: 'source_1' }]
const sourceAssignment: RouteSourceAssignment = {
  routeId: 'route_test',
  source: 'source_1',
  status: 'needs_review',
}

function routeWith(
  stopIds: string[],
  isLoop = false,
  name = '正向',
  serviceType: BusRoute['serviceType'] = 'fixed_stop',
): BusRoute {
  return {
    id: 'route_test',
    name: '测试线路',
    serviceType,
    allowIntermediateStop: serviceType === 'flexible_campus_bus',
    dataStatus: 'needs_review',
    directions: [{ name, isLoop, stopIds }],
  }
}

test('reports an unknown stopId', () => {
  const issues = validateRoute(routeWith(['a', 'unknown']), stops)

  assert.deepEqual(
    issues.map(({ code }) => code),
    ['unknown_stop'],
  )
  assert.match(issues[0]?.message ?? '', /references unknown stop unknown/)
})

test('reports an undeclared duplicate stop on a normal route', () => {
  const issues = validateRoute(routeWith(['a', 'b', 'c', 'b']), stops)

  assert.equal(issues.some(({ code }) => code === 'duplicate_stop'), true)
  assert.equal(issues.find(({ code }) => code === 'duplicate_stop')?.stopId, 'b')
})

test('accepts one first-and-last repeat on a loop route', () => {
  const issues = validateRoute(routeWith(['a', 'b', 'c', 'a'], true), stops)

  assert.deepEqual(issues, [])
})

test('reports a route with no directions', () => {
  const emptyRoute: BusRoute = {
    id: 'route_empty',
    name: '空线路',
    serviceType: 'fixed_stop',
    allowIntermediateStop: false,
    dataStatus: 'needs_review',
    directions: [],
  }

  assert.deepEqual(
    validateRoute(emptyRoute, stops).map(({ code }) => code),
    ['empty_route'],
  )
})

test('reports an empty direction name', () => {
  const issues = validateRoute(routeWith(['a', 'b'], false, '   '), stops)

  assert.equal(
    issues.some(({ code }) => code === 'missing_direction_name'),
    true,
  )
})

test('reports an empty direction stop list', () => {
  const issues = validateRoute(routeWith([]), stops)

  assert.deepEqual(
    issues.map(({ code }) => code),
    ['empty_direction'],
  )
  assert.match(issues[0]?.message ?? '', /direction 正向 has no stops/)
})

test('allows a flexible campus bus direction without a complete stop set', () => {
  const issues = validateRoute(
    routeWith([], false, '待采集方向', 'flexible_campus_bus'),
    stops,
  )

  assert.deepEqual(issues, [])
})

test('allows a flexible campus bus direction with one known stop', () => {
  const issues = validateRoute(
    routeWith(['a'], false, '部分已知站点', 'flexible_campus_bus'),
    stops,
  )

  assert.deepEqual(issues, [])
})

test('still validates known stop ids on a flexible campus bus route', () => {
  const issues = validateRoute(
    routeWith(['a', 'unknown'], false, '已知站点', 'flexible_campus_bus'),
    stops,
  )

  assert.equal(issues.some(({ code }) => code === 'unknown_stop'), true)
})

test('still rejects a repeat declaration without repeated known stops', () => {
  const route = routeWith([], true, '待采集环线', 'flexible_campus_bus')
  route.directions[0]!.allowedRepeatedStopIds = ['a']

  const issues = validateRoute(route, stops)

  assert.equal(
    issues.some(({ code }) => code === 'invalid_repeat_declaration'),
    true,
  )
})

test('reports missing route source metadata', () => {
  const route = routeWith(['a', 'b'])
  const result = validateRouteData([route], stops, sources, [])

  assert.equal(result.valid, false)
  assert.equal(result.issues.some(({ code }) => code === 'missing_source'), true)
})

test('requires non-empty source and status in every assignment', () => {
  for (const assignment of [
    { ...sourceAssignment, source: '   ' },
    { ...sourceAssignment, status: '   ' },
  ]) {
    const result = validateRouteData(
      [routeWith(['a', 'b'])],
      stops,
      sources,
      [assignment],
    )

    assert.equal(
      result.issues.some(({ code }) => code === 'missing_source'),
      true,
    )
  }
})

test('reports duplicate route ids', () => {
  const route = routeWith(['a', 'b'])
  const result = validateRouteData(
    [route, route],
    stops,
    sources,
    [sourceAssignment],
  )

  assert.equal(
    result.issues.some(({ code }) => code === 'duplicate_route_id'),
    true,
  )
})

test('reports duplicate stop ids', () => {
  const result = validateRouteData(
    [routeWith(['a', 'b'])],
    [...stops, stops[0]!],
    sources,
    [sourceAssignment],
  )

  assert.equal(
    result.issues.find(({ code }) => code === 'duplicate_stop_id')?.stopId,
    'a',
  )
})

test('reports duplicate source ids', () => {
  const result = validateRouteData(
    [routeWith(['a', 'b'])],
    stops,
    [...sources, sources[0]!],
    [sourceAssignment],
  )

  assert.equal(
    result.issues.find(({ code }) => code === 'duplicate_source_id')?.sourceId,
    'source_1',
  )
})

test('reports a route source assignment that references an unknown source', () => {
  const result = validateRouteData([routeWith(['a', 'b'])], stops, sources, [
    { ...sourceAssignment, source: 'unknown_source' },
  ])

  assert.equal(
    result.issues.find(({ code }) => code === 'unknown_source')?.sourceId,
    'unknown_source',
  )
})

test('reports a source assignment that references an unknown route', () => {
  const result = validateRouteData(
    [routeWith(['a', 'b'])],
    stops,
    sources,
    [sourceAssignment, { ...sourceAssignment, routeId: 'route_unknown' }],
  )

  assert.equal(
    result.issues.find(
      ({ code }) => code === 'unknown_route_source_assignment',
    )?.routeId,
    'route_unknown',
  )
})

test('reports a duplicate route source assignment', () => {
  const result = validateRouteData(
    [routeWith(['a', 'b'])],
    stops,
    sources,
    [sourceAssignment, sourceAssignment],
  )

  assert.equal(
    result.issues.some(
      ({ code }) => code === 'duplicate_route_source_assignment',
    ),
    true,
  )
})
