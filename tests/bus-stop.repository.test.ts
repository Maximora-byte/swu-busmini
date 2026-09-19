import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  busStopRepository,
  createStaticBusStopRepository,
} from '../miniprogram/services/repository/bus-stop.repository'

const ROUTE_1_FORWARD_STOP_IDS = [
  'jingguanyuan',
  'gate_6',
  'gate_2',
  'building_8',
  'tianjiabing',
  'yuanding',
  'gate_5',
]

test('loads 22 unique stops including retained future candidates', () => {
  const stops = busStopRepository.getAll()
  const ids = stops.map(({ id }) => id)

  assert.equal(stops.length, 22)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('gate_1'))
  assert.ok(ids.includes('library'))
  assert.ok(ids.includes('zhongtu'))
})

test('keeps every formal static stop coordinate null until field verification', () => {
  const stops = busStopRepository.getAll()

  for (const stop of stops) {
    assert.equal(stop.coordinate, null, stop.id)
    assert.equal(
      stop.coordinateTodo,
      'TODO: waiting for field verification',
      stop.id,
    )
  }
  assert.deepEqual(busStopRepository.getVerifiedStops(), [])
})

test('returns route 1 stops in requested order', () => {
  const stops = busStopRepository.getByIds(ROUTE_1_FORWARD_STOP_IDS)

  assert.deepEqual(
    stops.map(({ id }) => id),
    ROUTE_1_FORWARD_STOP_IDS,
  )
})

test('rejects duplicate stop ids', () => {
  const duplicatedStop = {
    id: 'duplicate',
    name: '重复站点',
    aliases: [],
    coordinate: null,
    coordinateTodo: 'TODO: waiting for field verification',
  }

  assert.throws(
    () => createStaticBusStopRepository([duplicatedStop, duplicatedStop]),
    /重复站点 id: duplicate/,
  )
})

test('returns only stops whose coordinate is explicitly verified', () => {
  const repository = createStaticBusStopRepository([
    {
      id: 'verified_stop',
      name: '已验证站点',
      aliases: [],
      coordinate: { latitude: 29.8, longitude: 106.4, verified: true },
    },
    {
      id: 'unverified_stop',
      name: '未验证站点',
      aliases: [],
      coordinate: { latitude: 29.81, longitude: 106.41, verified: false },
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
          coordinate: { latitude: 29.8, verified: false },
        },
      ]),
    /坐标结构无效/,
  )
})
