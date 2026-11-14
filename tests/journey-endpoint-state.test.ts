import assert from 'node:assert/strict'
import test from 'node:test'
import { endpointView, readEndpoint, swapEndpoints, transitionEndpoint, type EndpointState } from '../miniprogram/services/navigation/journey-endpoint-state'

const reference: EndpointState = {
  mode: 'place', index: 4, query: '参考站 · 去程', coordinate: { latitude: 29.82, longitude: 106.42 },
  allowedVisits: [{ routeId: 'route_1', visitIndex: 3, directionId: 'forward' }],
  placeDetails: '参考站位', nearbyStops: [{ stopId: 's1', name: '参考站', distanceMeters: 12, routeNames: ['1线'] }],
}

test('editing a confirmed endpoint drops its coordinate and direction constraint without changing the other endpoint', () => {
  const flat = { ...endpointView('origin', reference), ...endpointView('destination', { ...reference, query: '另一个站' }) }
  const edited = transitionEndpoint(readEndpoint(flat, 'origin'), { mode: 'search', query: '新输入' })
  Object.assign(flat, endpointView('origin', edited))
  assert.equal(flat.originCoordinate, null)
  assert.equal(flat.originAllowedVisits, null)
  assert.equal(flat.originPlaceDetails, '')
  assert.deepEqual(flat.originNearbyStops, [])
  assert.equal(flat.originQuery, '新输入')
  assert.equal(flat.destinationQuery, '另一个站')
  assert.deepEqual(flat.destinationAllowedVisits, [{ routeId: 'route_1', visitIndex: 3, directionId: 'forward' }])
  assert.equal(reference.query, '参考站 · 去程')
})

test('selecting a map point clears a prior exact stop restriction and owns its coordinate', () => {
  const point = { latitude: 29.83, longitude: 106.43 }
  const selected = transitionEndpoint(reference, { mode: 'map', query: '地图所选起点', coordinate: point })
  point.latitude = 1
  assert.deepEqual(selected.coordinate, { latitude: 29.83, longitude: 106.43 })
  assert.equal(selected.allowedVisits, null)
  assert.equal(selected.placeDetails, '')
})

test('swapping moves directional restrictions with their reference and converts GPS into a fixed destination point', () => {
  const origin = transitionEndpoint(reference, { mode: 'coordinate', query: '当前位置', coordinate: { latitude: 29.81, longitude: 106.41 } })
  const swapped = swapEndpoints(origin, reference)
  assert.equal(swapped.origin.query, '参考站 · 去程')
  assert.deepEqual(swapped.origin.allowedVisits, [{ routeId: 'route_1', visitIndex: 3, directionId: 'forward' }])
  assert.equal(swapped.destination.mode, 'map')
  assert.equal(swapped.destination.query, '原定位位置')
  assert.deepEqual(swapped.destination.coordinate, { latitude: 29.81, longitude: 106.41 })
  assert.equal(swapped.destination.allowedVisits, null)
  swapped.origin.allowedVisits![0].visitIndex = 9
  assert.equal(reference.allowedVisits![0].visitIndex, 3)
})

test('an unresolved current location becomes unconfirmed text when moved to the destination', () => {
  const unresolved = transitionEndpoint(reference, { mode: 'location', query: '当前位置' })
  const swapped = swapEndpoints(unresolved, reference)
  assert.equal(swapped.destination.mode, 'search')
  assert.equal(swapped.destination.query, '')
  assert.equal(swapped.destination.coordinate, null)
  assert.equal(swapped.destination.allowedVisits, null)
})

test('swapping map references renames their field labels without dropping their point or nearby stations', () => {
  const mapped = transitionEndpoint(reference, { mode: 'map', query: '地图所选终点', coordinate: reference.coordinate,
    placeDetails: '手动地图参考点。', nearbyStops: reference.nearbyStops })
  const swapped = swapEndpoints(reference, mapped)
  assert.equal(swapped.origin.query, '地图所选起点')
  assert.equal(swapped.destination.query, '参考站 · 去程')
  assert.deepEqual(swapped.origin.coordinate, { latitude: 29.82, longitude: 106.42 })
  assert.equal(swapped.origin.nearbyStops[0].stopId, 's1')
})
