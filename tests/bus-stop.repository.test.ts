import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  busStopRepository,
  createStaticBusStopRepository,
} from '../miniprogram/services/repository/bus-stop.repository'

const ROUTE_1_STOP_IDS = [
  'gate_1',
  'library',
  'building_8',
  'tjb',
  'gate_5',
]

test('loads the five route 1 stops without invented coordinates', () => {
  const stops = busStopRepository.getAll()

  assert.deepEqual(
    stops.map(({ id }) => id),
    ROUTE_1_STOP_IDS,
  )
  for (const stop of stops) {
    assert.equal(stop.coordinate, null)
    assert.equal(stop.coordinateStatus, 'pending')
    assert.match(stop.coordinateTodo ?? '', /TODO/)
  }
})

test('returns stops in the requested route order', () => {
  const reversedIds = [...ROUTE_1_STOP_IDS].reverse()
  const stops = busStopRepository.getByIds(reversedIds)

  assert.deepEqual(
    stops.map(({ id }) => id),
    reversedIds,
  )
})

test('rejects a partially filled coordinate', () => {
  assert.throws(
    () =>
      createStaticBusStopRepository([
        {
          id: 'invalid_stop',
          name: '无效站点',
          aliases: [],
          latitude: 29.8,
          longitude: null,
          coordinateStatus: 'pending',
        },
      ]),
    /经纬度必须同时填写或同时为空/,
  )
})
