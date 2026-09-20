import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { distanceBetween } from '../miniprogram/utils/distance'

test('returns zero for identical coordinates', () => {
  const coordinate = { latitude: 29.8, longitude: 106.4 }

  assert.equal(distanceBetween(coordinate, coordinate), 0)
})

test('calculates a reasonable Haversine distance in meters', () => {
  const distance = distanceBetween(
    { latitude: 29.8, longitude: 106.4 },
    { latitude: 29.801, longitude: 106.4 },
  )

  assert.ok(distance > 111)
  assert.ok(distance < 112)
})
