import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { wgs84ToGcj02 } from '../scripts/wgs84-to-gcj02'

// Evaluated independently using the unmodified upstream JavaScript wgs2gcj:
// https://github.com/googollee/eviltransform/blob/03ba58d92dfda57f8a1635f3805483c8fc10bd77/javascript/transform.js
// Numeric tolerance checks implementation parity, not real-world accuracy.
const referenceVectors = [
  [31.1774276, 121.5272106, 31.175303947687105, 121.53154193255554],
  [22.543847, 113.912316, 22.54079608003489, 113.91717656313807],
  [39.911954, 116.377817, 39.91334547892198, 116.38404733005198],
  [29.821, 106.424, 29.818514657923878, 106.42803219864689],
  [30, 72.004, 29.99690029141234, 72.00788603721708],
  [30, 137.8347, 29.997672227358095, 137.83915017978475],
  [0.8293, 106, 0.8301064190060584, 106.00268914529103],
  [55.8271, 106, 55.828548579483225, 106.00661898524663],
]

test('matches upstream forward conversion for city, campus-area, and rectangle-boundary points', () => {
  for (const [latitude, longitude, expectedLatitude, expectedLongitude] of referenceVectors) {
    const result = wgs84ToGcj02({ latitude, longitude })
    assert.ok(Math.abs(result.latitude - expectedLatitude) < 1e-10)
    assert.ok(Math.abs(result.longitude - expectedLongitude) < 1e-10)
  }
})

test('remains within the approximate upstream published sample vectors', () => {
  // Published in upstream javascript/test.js; these differ slightly from the
  // current transform.js results; allow their historical drift of <1e-6 degrees.
  const samples = [
    [31.1774276, 121.5272106, 31.17530398364597, 121.531541859215],
    [22.543847, 113.912316, 22.540796131694766, 113.9171774808363],
    [39.911954, 116.377817, 39.91334545536069, 116.38404722455657],
  ]
  for (const [latitude, longitude, expectedLatitude, expectedLongitude] of samples) {
    const result = wgs84ToGcj02({ latitude, longitude })
    assert.ok(Math.abs(result.latitude - expectedLatitude) < 1e-6)
    assert.ok(Math.abs(result.longitude - expectedLongitude) < 1e-6)
  }
})

test('leaves coordinates outside the upstream applicability rectangle unchanged', () => {
  const points = [
    { latitude: 51.5074, longitude: -0.1278 },
    { latitude: 30, longitude: 72.003999 },
    { latitude: 30, longitude: 137.834701 },
    { latitude: 0.829299, longitude: 106 },
    { latitude: 55.827101, longitude: 106 },
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
  ]
  for (const point of points) {
    const result = wgs84ToGcj02(point)
    assert.deepEqual(result, point)
    assert.notEqual(result, point)
  }
})

test('returns a new point without mutating the original WGS84 coordinate', () => {
  const point = Object.freeze({ latitude: 29.821, longitude: 106.424 })
  const result = wgs84ToGcj02(point)
  assert.deepEqual(point, { latitude: 29.821, longitude: 106.424 })
  assert.notEqual(result, point)
  assert.notEqual(result.longitude, point.longitude)
})

test('rejects nonfinite and out-of-range coordinates before conversion or passthrough', () => {
  const invalidPoints = [
    { latitude: NaN, longitude: 106 },
    { latitude: Infinity, longitude: 106 },
    { latitude: -Infinity, longitude: 106 },
    { latitude: 30, longitude: NaN },
    { latitude: 30, longitude: Infinity },
    { latitude: 30, longitude: -Infinity },
    { latitude: -90.000001, longitude: 106 },
    { latitude: 90.000001, longitude: 106 },
    { latitude: 30, longitude: -180.000001 },
    { latitude: 30, longitude: 180.000001 },
  ]
  for (const point of invalidPoints) {
    assert.throws(() => wgs84ToGcj02(point), RangeError)
  }
})
