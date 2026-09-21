import assert from 'node:assert/strict'
import test from 'node:test'

import coordinateReviewJson from '../miniprogram/data/coordinate-reviews.json'
import { coordinateReviews } from '../miniprogram/data/coordinate-reviews'
import poiJson from '../miniprogram/data/pois.json'
import { pois } from '../miniprogram/data/pois'
import routeGeometryJson from '../miniprogram/data/route-geometries.json'
import { routeGeometries } from '../miniprogram/data/route-geometries'
import routeJson from '../miniprogram/data/routes.json'
import { routes } from '../miniprogram/data/routes'
import stopJson from '../miniprogram/data/stops.json'
import { stops } from '../miniprogram/data/stops'

test('微信运行时 TypeScript Data Adapter 与离线 JSON 镜像一致', () => {
  assert.deepEqual(coordinateReviews, coordinateReviewJson)
  assert.deepEqual(pois, poiJson)
  assert.deepEqual(routeGeometries, routeGeometryJson)
  assert.deepEqual(routes, routeJson)
  assert.deepEqual(stops, stopJson)
})
