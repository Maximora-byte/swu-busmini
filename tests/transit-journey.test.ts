import assert from 'node:assert/strict'
import test from 'node:test'
import type { Coordinate } from '../miniprogram/models/index'
import type { TransitDataset, TransitRoute, TransitStop, TransitVisit } from '../miniprogram/models/current-transit'
import { currentTransitDataset } from '../miniprogram/data/current-transit'
import { createTransitJourneyService, transitJourneyService } from '../miniprogram/services/navigation/transit-journey.service'

const p = (longitude: number, latitude = 29.81): Coordinate => ({ latitude, longitude })
const stop = (id: string, coordinate: Coordinate, name = id): TransitStop => ({ id, name, coordinate })
const endpoint = (stopId: string) => ({ kind: 'stop' as const, stopId })
function visit(stopId: string, segmentIndex: number, ratio: number, mileageMeters: number, offsetMeters = 0): TransitVisit {
  return { stopId, sourceIndex: segmentIndex, segmentIndex, ratio, mileageMeters, offsetMeters }
}
function route(id: string, points: Coordinate[], visits: TransitVisit[], warnings: string[] = []): TransitRoute {
  return { id, name: id, color: '#008855', points, visits, warnings }
}
function dataset(stops: TransitStop[], routes: TransitRoute[]): TransitDataset {
  return { id: 'fixture', source: 'operator published fixture', observedAt: '2026-11-13', coordinateSystem: 'GCJ-02', quality: 'operator_published', stops, routes }
}
function assertPoints(actual: Coordinate[], expected: Coordinate[]): void {
  assert.equal(actual.length, expected.length)
  actual.forEach((point, index) => {
    assert.ok(Math.abs(point.latitude - expected[index].latitude) < 1e-10)
    assert.ok(Math.abs(point.longitude - expected[index].longitude) < 1e-10)
  })
}

// These fixtures catch using endpoint coordinates as roads, losing reverse direction,
// or re-finding repeated stops by ID instead of retaining their visit occurrence.
test('direct and reverse journeys crop to projected anchors and retain internal source vertices', () => {
  const points = [p(106.420), p(106.421), p(106.422), p(106.423)]
  const data = dataset([
    stop('a', p(106.42025, 29.8105)), stop('b', p(106.421)), stop('c', p(106.42275)),
  ], [route('r', points, [visit('a', 0, .25, 25, 55), visit('b', 1, 0, 100), visit('c', 2, .75, 275)], ['轨迹发布范围未闭合'])])
  const service = createTransitJourneyService(data)
  const forward = service.plan(endpoint('a'), endpoint('c')).journeys[0]
  assert.equal(forward.legs.length, 1)
  assert.equal(forward.legs[0].directionId, 'forward')
  assert.equal(forward.legs[0].boardingVisitIndex, 0)
  assert.equal(forward.legs[0].alightingVisitIndex, 2)
  assert.deepEqual(forward.legs[0].stopIds, ['a', 'b', 'c'])
  assertPoints(forward.legs[0].points, [p(106.42025), points[1], points[2], p(106.42275)])
  assert.equal(forward.rideDistanceMeters, 250)
  assert.equal(forward.accessDistanceMeters, 0)
  assert.equal(forward.egressDistanceMeters, 0)
  assert.ok(forward.warnings.some((warning) => warning.includes('55') && warning.includes('偏移')))
  assert.ok(forward.warnings.includes('轨迹发布范围未闭合'))
  const reverse = service.plan(endpoint('c'), endpoint('a')).journeys[0].legs[0]
  assert.equal(reverse.directionId, 'reverse')
  assert.deepEqual(reverse.stopIds, ['c', 'b', 'a'])
  assertPoints(reverse.points, [p(106.42275), points[2], points[1], p(106.42025)])
})

test('a transfer joins only the exact physical stop ID and two different routes', () => {
  const data = dataset([stop('a', p(106.420)), stop('x', p(106.421)), stop('d', p(106.422, 29.811))], [
    route('first', [p(106.420), p(106.421)], [visit('a', 0, 0, 0), visit('x', 0, 1, 100)]),
    route('second', [p(106.421), p(106.421, 29.811), p(106.422, 29.811)], [visit('x', 0, 0, 0), visit('d', 1, 1, 200)]),
  ])
  const result = createTransitJourneyService(data).plan(endpoint('a'), endpoint('d'))
  assert.equal(result.journeys.length, 1)
  const journey = result.journeys[0]
  assert.equal(journey.transferStopId, 'x')
  assert.equal(journey.rideDistanceMeters, 300)
  assert.deepEqual(journey.legs.map((leg) => leg.routeId), ['first', 'second'])
  assert.deepEqual(journey.legs.map((leg) => leg.stopIds), [['a', 'x'], ['x', 'd']])
  assert.deepEqual(journey.legs[1].points, [p(106.421), p(106.421, 29.811), p(106.422, 29.811)])
})

test('same-name different-position stops and different-name same-position stops never create transfers', () => {
  for (const sameCoordinate of [false, true]) {
    const data = dataset([
      stop('a', p(106.420)), stop('x1', p(106.421), '同名站'),
      stop('x2', sameCoordinate ? p(106.421) : p(106.421, 29.811), sameCoordinate ? '另一站' : '同名站'),
      stop('d', p(106.422)),
    ], [
      route('first', [p(106.420), p(106.421)], [visit('a', 0, 0, 0), visit('x1', 0, 1, 100)]),
      route('second', [p(106.421), p(106.422)], [visit('x2', 0, 0, 0), visit('d', 0, 1, 100)]),
    ])
    assert.deepEqual(createTransitJourneyService(data).plan(endpoint('a'), endpoint('d')).journeys, [])
  }
})

test('repeated physical visits keep the exact occurrence when ranking and clipping both directions', () => {
  const a = p(106.420), b = p(106.421), c = p(106.420, 29.811)
  const data = dataset([stop('a', a), stop('b', b), stop('c', c)], [
    route('r', [a, b, a, c], [visit('a', 0, 0, 0), visit('b', 1, 0, 100), visit('a', 2, 0, 200), visit('c', 2, 1, 300)]),
  ])
  const service = createTransitJourneyService(data)
  const forward = service.plan(endpoint('a'), endpoint('c')).journeys
  assert.equal(forward[0].legs[0].boardingVisitIndex, 2)
  assert.deepEqual(forward[0].legs[0].points, [a, c])
  assert.equal(forward[1].legs[0].boardingVisitIndex, 0)
  assert.deepEqual(forward[1].legs[0].stopIds, ['a', 'b', 'a', 'c'])
  const reverse = service.plan(endpoint('c'), endpoint('a')).journeys[0].legs[0]
  assert.equal(reverse.alightingVisitIndex, 2)
  assert.deepEqual(reverse.points, [c, a])
})

test('open published geometry never wraps from its last point to its first', () => {
  const points = [p(106.420), p(106.421), p(106.421, 29.811)]
  const data = dataset([stop('a', points[0]), stop('b', points[1]), stop('c', points[2])], [
    route('环线名称不代表闭合', points, [visit('a', 0, 0, 0), visit('b', 1, 0, 100), visit('c', 1, 1, 200)]),
  ])
  const leg = createTransitJourneyService(data).plan(endpoint('c'), endpoint('a')).journeys[0].legs[0]
  assert.deepEqual(leg.points, [points[2], points[1], points[0]])
  assert.equal(leg.distanceMeters, 200)
  assert.equal(leg.directionId, 'reverse')
})

test('coordinate candidates consider a reachable non-nearest stop and ignore unused historical stops', () => {
  const data = dataset([
    stop('unused', p(106.420)), stop('near', p(106.4201)), stop('other', p(106.4202)),
    stop('reachable', p(106.4205)), stop('d', p(106.430)),
  ], [
    route('isolated', [p(106.4201), p(106.4202)], [visit('near', 0, 0, 0), visit('other', 0, 1, 10)]),
    route('current', [p(106.4205), p(106.430)], [visit('reachable', 0, 0, 0), visit('d', 0, 1, 900)]),
  ])
  const service = createTransitJourneyService(data)
  const result = service.plan({ kind: 'coordinate', coordinate: p(106.420) }, endpoint('d'))
  assert.equal(result.journeys[0].legs[0].boardingStopId, 'reachable')
  assert.ok(result.journeys[0].accessDistanceMeters > 40 && result.journeys[0].accessDistanceMeters < 60)
  assert.deepEqual(service.plan(endpoint('unused'), endpoint('d')).journeys, [])
  const outside = service.plan({ kind: 'coordinate', coordinate: p(106.50, 29.90) }, endpoint('d'))
  assert.deepEqual(outside.journeys, [])
  assert.match(outside.message, /800|范围/)
  const egress = service.plan(endpoint('d'), { kind: 'coordinate', coordinate: p(106.420) }).journeys[0]
  assert.equal(egress.legs[0].alightingStopId, 'reachable')
  assert.ok(egress.egressDistanceMeters > 40 && egress.egressDistanceMeters < 60)
})

test('coordinate selection is bounded to the nearest six active stops', () => {
  const stops = Array.from({ length: 7 }, (_, index) => stop(`s${index}`, p(106.420 + index * .0001)))
  const d = stop('d', p(106.440))
  const isolated = stops.slice(0, 6).map((item, index) => route(`isolated-${index}`, [item.coordinate, p(item.coordinate.longitude, 29.8101)], [visit(item.id, 0, 0, 0)]))
  const data = dataset([...stops, d], [...isolated, route('seventh', [stops[6].coordinate, d.coordinate], [visit('s6', 0, 0, 0), visit('d', 0, 1, 1800)])])
  assert.deepEqual(createTransitJourneyService(data).plan({ kind: 'coordinate', coordinate: p(106.420) }, endpoint('d')).journeys, [])
})

test('zero-length and at-most-one-meter rides are excluded along with same-route transfers', () => {
  const data = dataset([stop('a', p(106.420)), stop('x', p(106.420)), stop('d', p(106.421))], [
    route('r', [p(106.420), p(106.421)], [visit('a', 0, 0, 0), visit('x', 0, 0, 0), visit('d', 0, .01, 1)]),
  ])
  const service = createTransitJourneyService(data)
  assert.deepEqual(service.plan(endpoint('a'), endpoint('x')).journeys, [])
  assert.deepEqual(service.plan(endpoint('a'), endpoint('d')).journeys, [])
  assert.deepEqual(service.plan(endpoint('a'), endpoint('a')).journeys, [])
})

test('an intermediate station on one route does not create a same-route transfer alternative', () => {
  const data = dataset([stop('a', p(106.420)), stop('x', p(106.421)), stop('d', p(106.422))], [
    route('r', [p(106.420), p(106.421), p(106.422)], [visit('a', 0, 0, 0), visit('x', 1, 0, 100), visit('d', 1, 1, 200)]),
  ])
  const result = createTransitJourneyService(data).plan(endpoint('a'), endpoint('d'))
  assert.equal(result.journeys.length, 1)
  assert.equal(result.journeys[0].legs.length, 1)
  assert.equal(result.journeys[0].rideDistanceMeters, 200)
})

test('physically coincident endpoints do not recommend a bus detour through another nearby stop', () => {
  const a = p(106.420), b = p(106.421), turn = p(106.422, 29.811)
  // Separate IDs/names remain distinct stations even though their physical positions coincide.
  const data = dataset([stop('a', a), stop('b', b, '到达站'), stop('c', b, '另一名称')], [
    route('r', [a, b, turn, b], [visit('a', 0, 0, 0), visit('b', 1, 0, 100), visit('c', 2, 1, 400)]),
  ])
  const service = createTransitJourneyService(data)
  const pairs = [
    [{ kind: 'coordinate' as const, coordinate: b }, endpoint('b')],
    [endpoint('b'), { kind: 'coordinate' as const, coordinate: b }],
    [endpoint('b'), endpoint('c')],
    [{ kind: 'coordinate' as const, coordinate: b }, { kind: 'coordinate' as const, coordinate: p(106.421005) }],
  ] as const
  for (const [from, to] of pairs) {
    const result = service.plan(from, to)
    assert.deepEqual(result.journeys, [])
    assert.match(result.message, /无需乘车|核对位置/)
  }
  const unknown = service.plan(endpoint('missing'), { kind: 'coordinate', coordinate: b })
  assert.deepEqual(unknown.journeys, [])
  assert.match(unknown.message, /站点.*重新选择/)
  // This location check must not merge identities for ordinary trips.
  assert.equal(service.plan(endpoint('a'), endpoint('c')).journeys[0].legs[0].alightingStopId, 'c')
})

test('results prioritize transfer count, then straight-line connections, then ride distance, and cap at six', () => {
  const a = p(106.420), d = p(106.421)
  const routes = Array.from({ length: 8 }, (_, index) => route(`r${index}`, [a, d], [visit('a', 0, 0, 0), visit('d', 0, 1, 800 - index * 50)]))
  const service = createTransitJourneyService(dataset([stop('a', a), stop('d', d)], routes))
  const result = service.plan(endpoint('a'), endpoint('d'))
  assert.equal(result.journeys.length, 6)
  assert.deepEqual(result.journeys.map((journey) => journey.legs[0].routeId), ['r7', 'r6', 'r5', 'r4', 'r3', 'r2'])
  assert.ok(result.journeys.every((journey) => journey.legs.length === 1))
})

test('a shorter transfer never outranks a direct ride and a farther boarding stop never wins only on ride mileage', () => {
  const a = p(106.420), farther = p(106.4205), x = p(106.421), d = p(106.423)
  const data = dataset([stop('a', a), stop('farther', farther), stop('x', x), stop('d', d)], [
    route('direct-near', [a, d], [visit('a', 0, 0, 0), visit('d', 0, 1, 500)]),
    route('direct-farther', [farther, d], [visit('farther', 0, 0, 0), visit('d', 0, 1, 100)]),
    route('transfer-first', [a, x], [visit('a', 0, 0, 0), visit('x', 0, 1, 50)]),
    route('transfer-second', [x, d], [visit('x', 0, 0, 0), visit('d', 0, 1, 50)]),
  ])
  const journeys = createTransitJourneyService(data).plan({ kind: 'coordinate', coordinate: a }, endpoint('d')).journeys
  assert.equal(journeys[0].legs[0].routeId, 'direct-near')
  assert.equal(journeys[1].legs[0].routeId, 'direct-farther')
  const transferIndex = journeys.findIndex((journey) => journey.legs.length === 2)
  assert.ok(transferIndex >= 3)
  assert.ok(journeys.slice(0, transferIndex).every((journey) => journey.legs.length === 1))
})

test('unknown and invalid endpoints and datasets without service return explicit empty results', () => {
  const empty = createTransitJourneyService(dataset([], []))
  assert.deepEqual(empty.plan(endpoint('missing'), endpoint('also-missing')).journeys, [])
  assert.match(empty.plan(endpoint('missing'), endpoint('also-missing')).message, /数据/)
  const service = createTransitJourneyService(dataset([stop('a', p(106.420)), stop('b', p(106.421))], [
    route('r', [p(106.420), p(106.421)], [visit('a', 0, 0, 0), visit('b', 0, 1, 100)]),
  ]))
  assert.deepEqual(service.plan(endpoint('missing'), endpoint('also-missing')).journeys, [])
  assert.ok(service.plan(endpoint('missing'), endpoint('also-missing')).message.length)
  for (const coordinate of [p(NaN), p(106, 91), p(181)]) {
    const result = service.plan({ kind: 'coordinate', coordinate }, endpoint('b'))
    assert.deepEqual(result.journeys, [])
    assert.match(result.message, /坐标无效/)
  }
})

test('caller mutations cannot change later geometry or warnings', () => {
  const a = p(106.420), b = p(106.421)
  const input = dataset([stop('a', a), stop('b', b)], [route('r', [a, b], [visit('a', 0, 0, 0), visit('b', 0, 1, 100)], ['公开数据'])])
  const service = createTransitJourneyService(input)
  input.routes[0].points[0].latitude = 0
  const first = service.plan(endpoint('a'), endpoint('b')).journeys[0]
  first.legs[0].points[0].latitude = 0
  first.legs[0].stopIds.push('injected')
  first.warnings.push('injected')
  const next = service.plan(endpoint('a'), endpoint('b')).journeys[0]
  assert.equal(next.legs[0].points[0].latitude, 29.81)
  assert.deepEqual(next.legs[0].stopIds, ['a', 'b'])
  assert.deepEqual(next.warnings, ['公开数据'])
})

test('published route 4 geometry is clipped at the measured 2号门 and 橘园 anchors in both directions', () => {
  const publishedRoute = currentTransitDataset.routes.find((item) => item.id === 'route_4')!
  const service = createTransitJourneyService({ ...currentTransitDataset, routes: [publishedRoute] })
  const from = endpoint('stop_e7b9941b2e553f53')
  const to = endpoint('stop_cf4a995c275ecb84')
  const journey = service.plan(from, to).journeys[0]
  assert.equal(journey.legs[0].routeName, '4号线')
  assert.equal(journey.legs[0].boardingVisitIndex, 0)
  assert.equal(journey.legs[0].alightingVisitIndex, 14)
  assert.equal(journey.legs[0].points.length, 61)
  assertPoints([journey.legs[0].points[0], journey.legs[0].points[60]], [
    { latitude: 29.813854089034056, longitude: 106.42057102878246 },
    { latitude: 29.825996671125544, longitude: 106.42601599002509 },
  ])
  assert.deepEqual(journey.legs[0].points.slice(1, -1), publishedRoute.points.slice(1, -1))
  assert.ok(Math.abs(journey.rideDistanceMeters - 2410.887810783974) < .01)
  const reverse = service.plan(to, from).journeys[0]
  assert.equal(reverse.legs[0].directionId, 'reverse')
  assert.deepEqual(reverse.legs[0].points, journey.legs[0].points.slice().reverse())
})

test('published route 1 and 2 connect at exact shared 5号门 instead of merging their different 经管院 observations', () => {
  const result = transitJourneyService.plan(endpoint('stop_6f8c6b0adc4465e4'), endpoint('stop_89a18a92bac03153'))
  assert.ok(result.journeys.length > 0)
  const viaGate5 = result.journeys.find((journey) => journey.transferStopId === 'stop_afc38ff511a402d6')
  assert.ok(viaGate5)
  assert.deepEqual(viaGate5.legs.map((leg) => leg.routeId), ['route_1', 'route_2'])
  assert.deepEqual(viaGate5.legs.map((leg) => leg.directionId), ['forward', 'reverse'])
  assert.deepEqual(viaGate5.legs.map((leg) => [leg.boardingVisitIndex, leg.alightingVisitIndex]), [[0, 15], [14, 13]])
  assert.ok(result.journeys.every((journey) => journey.legs.length === 2))
  assert.ok(result.journeys.every((journey) => journey.legs.every((leg) => leg.routeId !== 'route_9')))
})
