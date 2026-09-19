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
    assert.equal(stop.coordinateTodo, 'TODO: waiting for field verification')
  }
  assert.deepEqual(busStopRepository.getVerifiedStops(), [])
})

test('returns stops in the requested route order', () => {
  const reversedIds = [...ROUTE_1_STOP_IDS].reverse()
  const stops = busStopRepository.getByIds(reversedIds)

  assert.deepEqual(
    stops.map(({ id }) => id),
    reversedIds,
  )
})

test('returns only stops whose coordinate is explicitly verified', () => {
  const repository = createStaticBusStopRepository([
    {
      id: 'verified_stop',
      name: '已验证站点',
      aliases: [],
      coordinate: {
        latitude: 29.8,
        longitude: 106.4,
        verified: true,
      },
    },
    {
      id: 'unverified_stop',
      name: '未验证站点',
      aliases: [],
      coordinate: {
        latitude: 29.81,
        longitude: 106.41,
        verified: false,
      },
    },
    {
      id: 'pending_stop',
      name: '待采集站点',
      aliases: [],
      coordinate: null,
      coordinateTodo: 'TODO: waiting for field verification',
    },
  ])

  const verifiedStops = repository.getVerifiedStops()

  assert.deepEqual(
    verifiedStops.map(({ id }) => id),
    ['verified_stop'],
  )
  assert.equal(verifiedStops[0]?.coordinate.verified, true)
})

test('rejects an incomplete coordinate object', () => {
  assert.throws(
    () =>
      createStaticBusStopRepository([
        {
          id: 'invalid_stop',
          name: '无效站点',
          aliases: [],
          coordinate: {
            latitude: 29.8,
            verified: false,
          },
        },
      ]),
    /坐标结构无效/,
  )
})
