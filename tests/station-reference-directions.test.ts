import assert from 'node:assert/strict'
import test from 'node:test'
import type { TransitDataset, TransitRoute } from '../miniprogram/models/current-transit'
import { getUnifiedTransitStops } from '../miniprogram/services/map/unified-transit-stops'
import { currentTransitDataset } from '../miniprogram/data/current-transit'

const point = (longitude: number) => ({ longitude, latitude: 29.82 })
function fixture(): TransitDataset {
  const visits = (ids: string[]) => ids.map((stopId, i) => ({ stopId, sourceIndex: i, segmentIndex: Math.min(i, 1), ratio: i === 2 ? 1 : 0, mileageMeters: i * 100, offsetMeters: 0 }))
  const line = (id: string, reverse: boolean): TransitRoute => ({ id, name: id, color: '#128355', warnings: [],
    points: [point(106.42), point(106.421), point(106.422)].slice()[reverse ? 'reverse' : 'slice'](),
    visits: visits(reverse ? ['b', 's2', 'a'] : ['a', 's1', 'b']) })
  return { id: 'directions', source: 'synthetic', observedAt: '2026-11-14', coordinateSystem: 'GCJ-02', quality: 'operator_published',
    stops: [{ id: 'a', name: '西侧', coordinate: point(106.42) }, { id: 's1', name: '统一站', coordinate: point(106.421) },
      { id: 's2', name: '统一站', coordinate: point(106.42101) }, { id: 'b', name: '东侧', coordinate: point(106.422) }],
    routes: [line('east', false), line('west', true)] }
}

test('two reference directions align local travel vectors across opposite source ordering', () => {
  const data = fixture(), before = JSON.stringify(data)
  const station = getUnifiedTransitStops(data).find((station) => station.name === '统一站')!
  assert.equal(station.directions.length, 2)
  const [a, b] = station.directions
  assert.deepEqual(a.allowedVisits.map((v) => [v.routeId, v.directionId]), [['east', 'forward'], ['west', 'reverse']])
  assert.deepEqual(b.allowedVisits.map((v) => [v.routeId, v.directionId]), [['east', 'reverse'], ['west', 'forward']])
  assert.match(a.hint, /东侧/)
  assert.match(b.hint, /西侧/)
  assert.ok(a.canDepart && a.canArrive && b.canDepart && b.canArrive)
  assert.equal(JSON.stringify(data), before)
})

test('published station families show at most two directions and no repeated route rows per direction', () => {
  const stations = getUnifiedTransitStops(currentTransitDataset)
  assert.ok(stations.length < 53)
  for (const station of stations) {
    assert.ok(station.directions.length <= 2)
    for (const direction of station.directions) {
      assert.equal(new Set(direction.routes.map((r) => r.routeId)).size, direction.routes.length)
      for (const rule of direction.allowedVisits) {
        const route = currentTransitDataset.routes.find((r) => r.id === rule.routeId)!
        assert.ok(station.stopIds.includes(route.visits[rule.visitIndex].stopId))
        assert.ok(route.visits[rule.visitIndex].offsetMeters <= 35)
      }
    }
  }
})

test('known gate alias merges nearby records while distant same-name records stay separate', () => {
  const data = fixture(); data.routes = []
  data.stops = [{ id: 'a', name: '共青花园2号门', coordinate: point(106.42) },
    { id: 'b', name: '共青团花园2号门', coordinate: point(106.4202) },
    { id: 'c', name: '共青团花园2号门', coordinate: point(106.43) }]
  const stations = getUnifiedTransitStops(data)
  assert.equal(stations.length, 2)
  assert.deepEqual(stations[0].stopIds, ['a', 'b'])
  assert.equal(stations[0].directions.length, 0)
})

test('perpendicular branches and degenerate paths do not invent an aligned reference direction', () => {
  const data = fixture()
  data.routes[1].points = [{ latitude: 29.819, longitude: 106.421 }, point(106.421), { latitude: 29.821, longitude: 106.421 }]
  const group = getUnifiedTransitStops(data).find((s) => s.name === '统一站')!
  assert.ok(group.directions.every((d) => !d.allowedVisits.some((v) => v.routeId === 'west')))
  data.routes.forEach((r) => { r.points = [point(106.421), point(106.421), point(106.421)] })
  assert.equal(getUnifiedTransitStops(data).find((s) => s.name === '统一站')!.directions.length, 0)
})

test('turnaround cusps cannot be advertised as opposite reference travel directions', () => {
  const data = fixture()
  data.routes[0].points[2] = point(106.42)
  const station = getUnifiedTransitStops(data).find((s) => s.name === '统一站')!
  assert.ok(station.directions.every((d) => !d.allowedVisits.some((v) => v.routeId === 'east')))
  const gate = getUnifiedTransitStops(currentTransitDataset).find((s) => s.name === '2号门')!
  for (const routeId of ['route_3', 'route_6']) {
    assert.ok(gate.directions.every((d) => !d.allowedVisits.some((v) => v.routeId === routeId)))
  }
})
