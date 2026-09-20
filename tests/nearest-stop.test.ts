import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { createNearestStopService } from '../miniprogram/services/location/nearest-stop.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'

const origin = { latitude: 29.8, longitude: 106.4 }

test('returns verified stops ordered by distance', () => {
  const repository = createStaticBusStopRepository([
    {
      id: 'far_stop',
      name: '较远站点',
      aliases: [],
      coordinate: { latitude: 29.81, longitude: 106.4, verified: true },
    },
    {
      id: 'near_stop',
      name: '最近站点',
      aliases: [],
      coordinate: { latitude: 29.801, longitude: 106.4, verified: true },
    },
  ])
  const service = createNearestStopService(repository)

  const results = service.getNearestStops(origin)

  assert.deepEqual(
    results.map(({ stopId }) => stopId),
    ['near_stop', 'far_stop'],
  )
  assert.equal(results[0]?.stopName, '最近站点')
  assert.deepEqual(results[0]?.coordinate, {
    latitude: 29.801,
    longitude: 106.4,
  })
  assert.ok((results[0]?.distanceMeters ?? 0) > 0)
})

test('ignores stops with null coordinates', () => {
  const repository = createStaticBusStopRepository([
    {
      id: 'pending_stop',
      name: '待采集站点',
      aliases: [],
      coordinate: null,
    },
    {
      id: 'verified_stop',
      name: '已验证站点',
      aliases: [],
      coordinate: { latitude: 29.802, longitude: 106.4, verified: true },
    },
  ])

  const results = createNearestStopService(repository).getNearestStops(origin)

  assert.deepEqual(results.map(({ stopId }) => stopId), ['verified_stop'])
})

test('ignores stops whose coordinates are not verified', () => {
  const repository = createStaticBusStopRepository([
    {
      id: 'unverified_stop',
      name: '未验证站点',
      aliases: [],
      coordinate: { latitude: 29.8001, longitude: 106.4, verified: false },
    },
    {
      id: 'verified_stop',
      name: '已验证站点',
      aliases: [],
      coordinate: { latitude: 29.803, longitude: 106.4, verified: true },
    },
  ])

  const results = createNearestStopService(repository).getNearestStops(origin)

  assert.deepEqual(results.map(({ stopId }) => stopId), ['verified_stop'])
})

test('returns an empty list when no verified coordinates are available', () => {
  const repository = createStaticBusStopRepository([
    {
      id: 'pending_stop',
      name: '待采集站点',
      aliases: [],
      coordinate: null,
    },
    {
      id: 'unverified_stop',
      name: '未验证站点',
      aliases: [],
      coordinate: { latitude: 29.8, longitude: 106.4, verified: false },
    },
  ])

  assert.deepEqual(
    createNearestStopService(repository).getNearestStops(origin),
    [],
  )
})
