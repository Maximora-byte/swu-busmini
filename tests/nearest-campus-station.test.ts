import assert from 'node:assert/strict'
import test from 'node:test'
import type { TransitDataset } from '../miniprogram/models/current-transit'
import { currentTransitDataset } from '../miniprogram/data/current-transit'
import { createNearestCampusStationService } from '../miniprogram/services/navigation/nearest-campus-station.service'

const point = (offset = 0) => ({ latitude: 29.82, longitude: 106.42 + offset })
function fixture(): TransitDataset {
  const stops = [
    { id: 'blocked', name: '待核对站', coordinate: point() },
    { id: 'a1', name: '统一站', coordinate: point(.00005) },
    { id: 'a2', name: '统一站', coordinate: point(.00002) },
    { id: 'b', name: '另一站', coordinate: point(.0001) },
    { id: 'far', name: '远站', coordinate: point(.02) },
  ]
  return { id: 'nearest', source: 'synthetic', observedAt: '2026-11-14', coordinateSystem: 'GCJ-02', quality: 'operator_published', stops,
    routes: stops.map((s, i) => ({ id: `r${i}`, name: `线路${i}`, color: '#128355', points: [s.coordinate, point(.03)], warnings: [],
      visits: [{ stopId: s.id, sourceIndex: 0, segmentIndex: 0, ratio: 0, mileageMeters: 0, offsetMeters: i ? 0 : 100 }] })) }
}

test('nearest campus stations deduplicate station areas and target the nearest eligible source coordinate', () => {
  const data = fixture(), before = JSON.stringify(data)
  const result = createNearestCampusStationService(data).nearby(point())
  assert.equal(result.stations.length, 2)
  assert.equal(result.stations[0].stopId, 'a2')
  assert.deepEqual(result.stations[0].coordinate, point(.00002))
  assert.deepEqual(result.stations[0].routeNames, ['线路2'])
  assert.equal(new Set(result.stations.map((s) => s.stationId)).size, 2)
  assert.ok(result.stations[0].distanceMeters < result.stations[1].distanceMeters)
  assert.equal(JSON.stringify(data), before)
})

test('invalid and out-of-range positions do not return an arbitrary default station', () => {
  const service = createNearestCampusStationService(fixture())
  for (const p of [{ latitude: NaN, longitude: 106.42 }, { latitude: 91, longitude: 106.42 }, { latitude: 29.82, longitude: 181 }]) {
    assert.equal(service.nearby(p).stations.length, 0)
  }
  const outside = service.nearby({ latitude: 31, longitude: 121 })
  assert.equal(outside.stations.length, 0)
  assert.match(outside.message, /800/)
})

test('station recommendations are bounded and defensive, including zero-distance selection', () => {
  const data = fixture(), service = createNearestCampusStationService(data)
  const first = service.nearby(point(.00002)).stations[0]
  assert.equal(first.distanceMeters, 0)
  first.coordinate.latitude = 0
  first.routeNames.push('mutated')
  data.stops[2].coordinate.longitude = 0
  const again = service.nearby(point(.00002)).stations[0]
  assert.equal(again.distanceMeters, 0)
  assert.equal(again.coordinate.latitude, 29.82)
  assert.ok(!again.routeNames.includes('mutated'))
  assert.ok(createNearestCampusStationService(currentTransitDataset).nearby(currentTransitDataset.stops[20].coordinate).stations.length <= 3)
})

test('each published recommendation advertises only eligible lines at its exact original record', () => {
  const service = createNearestCampusStationService(currentTransitDataset)
  for (const stop of currentTransitDataset.stops) {
    for (const candidate of service.nearby(stop.coordinate).stations) {
      const source = currentTransitDataset.stops.find((s) => s.id === candidate.stopId)!
      assert.deepEqual(candidate.coordinate, source.coordinate)
      for (const name of candidate.routeNames) assert.ok(currentTransitDataset.routes.some((r) => r.name === name &&
        r.visits.some((v) => v.stopId === candidate.stopId && v.offsetMeters >= 0 && v.offsetMeters <= 35)))
    }
  }
})
