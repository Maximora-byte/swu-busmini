import assert from 'node:assert/strict'
import test from 'node:test'
import { currentTransitDataset } from '../miniprogram/data/current-transit'
import { getCurrentMapPresentation } from '../miniprogram/services/map/current-transit-map.service'

test('campus network uses all ten current routes with exact source colors and no old route9', () => {
  const view = getCurrentMapPresentation(currentTransitDataset, 'route_8', { network: true })
  assert.equal(view.legend.length, 10)
  assert.equal(view.polylines.length, 10)
  assert.ok(!view.legend.some(({ routeId }) => routeId === 'route_9'))
  assert.equal(view.legend.find(({ routeId }) => routeId === 'route_8')!.color, '#a660d9')
  assert.equal(view.fitPoints.length, 682)
  assert.equal(view.stopIds.length, 103)
})

test('a selected route has only its own source geometry and its matching legend', () => {
  const view = getCurrentMapPresentation(currentTransitDataset, 'route_4')
  const route = currentTransitDataset.routes.find(({ id }) => id === 'route_4')!
  assert.equal(view.legend.length, 1)
  assert.equal(view.legend[0].routeId, route.id)
  assert.equal(JSON.stringify(view.polylines[0].points), JSON.stringify(route.points))
  assert.equal(view.stops.length, route.visits.length)
})

test('reverse reference order preserves original visit keys and quarantined stops remain visible', () => {
  const forward = getCurrentMapPresentation(currentTransitDataset, 'route_3b')
  const reverse = getCurrentMapPresentation(currentTransitDataset, 'route_3b', { reverse: true })
  assert.deepEqual(reverse.stops.map(({ key }) => key), forward.stops.map(({ key }) => key).reverse())
  const gate = forward.stops.find(({ name }) => name === '2号门')!
  assert.equal(gate.canBoard, false)
  assert.match(gate.reviewText, /核对/)
  assert.ok(forward.stopIds.includes(gate.stopId))
  assert.ok(!forward.eligibleStopIds.includes(gate.stopId))
  assert.ok(getCurrentMapPresentation(currentTransitDataset, 'route_3').eligibleStopIds.includes(gate.stopId))
})

test('repeated visits have distinct keys and returned map values cannot mutate published data', () => {
  const fixture = structuredClone(currentTransitDataset)
  const route = fixture.routes[0]
  route.visits.push({ ...route.visits[0], sourceIndex: 999 })
  const view = getCurrentMapPresentation(fixture, route.id)
  assert.equal(new Set(view.stops.map(({ key }) => key)).size, route.visits.length)
  const original = route.points[0].latitude
  view.polylines[0].points[0].latitude = 0
  view.stops[0].coordinate.latitude = 0
  view.warnings.push('caller mutation')
  const again = getCurrentMapPresentation(fixture, route.id)
  assert.equal(again.polylines[0].points[0].latitude, original)
  assert.notEqual(again.stops[0].coordinate.latitude, 0)
  assert.ok(!again.warnings.includes('caller mutation'))
})
