import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { BusRoute, BusStop } from '../miniprogram/models/index'
import {
  validateRoute,
  validateRouteData,
} from '../miniprogram/services/validation/route-data-validator'

const stops: readonly BusStop[] = ['a', 'b', 'c'].map((id) => ({
  id,
  name: id.toUpperCase(),
  aliases: [],
  coordinate: null,
}))

function routeWith(
  stopIds: string[],
  isLoop = false,
  name = '正向',
): BusRoute {
  return {
    id: 'route_test',
    name: '测试线路',
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

test('reports missing route source metadata', () => {
  const route = routeWith(['a', 'b'])
  const result = validateRouteData([route], stops, [])

  assert.equal(result.valid, false)
  assert.equal(result.issues.some(({ code }) => code === 'missing_source'), true)
})
