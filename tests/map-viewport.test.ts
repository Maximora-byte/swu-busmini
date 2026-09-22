import assert from 'node:assert/strict'
import test from 'node:test'
import { BEIBEI_VIEWPORT, CAMPUS_VIEWPORT, getLocationViewport } from '../miniprogram/services/map/map-viewport.service'

test('local location can center the map inside Beibei viewport', () => {
  const view = getLocationViewport(BEIBEI_VIEWPORT.center)
  assert.equal(view.isWithinArea, true)
  assert.deepEqual(view.center, BEIBEI_VIEWPORT.center)
  assert.equal(view.scale, 17)
})

test('outside location keeps the map in Beibei instead of following simulator location', () => {
  const view = getLocationViewport({ latitude: 39.9, longitude: 116.4 })
  assert.equal(view.isWithinArea, false)
  assert.deepEqual(view.center, BEIBEI_VIEWPORT.center)
  assert.equal(view.scale, CAMPUS_VIEWPORT.scale)
})

test('invalid location cannot become the viewport center', () => {
  assert.equal(getLocationViewport({ latitude: NaN, longitude: Infinity }).isWithinArea, false)
})
