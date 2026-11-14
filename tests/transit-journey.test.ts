import assert from 'node:assert/strict'
import test from 'node:test'
import type { Coordinate } from '../miniprogram/models/index'
import type { TransitDataset, TransitRoute, TransitStop, TransitVisit } from '../miniprogram/models/current-transit'
import { currentTransitDataset } from '../miniprogram/data/current-transit'
import { createTransitJourneyService, transitJourneyService } from '../miniprogram/services/navigation/transit-journey.service'
import { isAutomaticBoardingVisit } from '../miniprogram/services/navigation/transit-visit-policy'

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

test('reference direction constraints apply to both ends of direct and transfer rides', () => {
  const data = dataset([stop('a', p(106.420)), stop('x', p(106.421)), stop('d', p(106.422))], [
    route('first', [p(106.420), p(106.421)], [visit('a', 0, 0, 0), visit('x', 0, 1, 100)]),
    route('second', [p(106.421), p(106.422)], [visit('x', 0, 0, 0), visit('d', 0, 1, 100)]),
  ])
  const service = createTransitJourneyService(data)
  const a = { ...endpoint('a'), allowedVisits: [{ routeId: 'first', visitIndex: 0, directionId: 'forward' as const }] }
  const d = { ...endpoint('d'), allowedVisits: [{ routeId: 'second', visitIndex: 1, directionId: 'forward' as const }] }
  assert.equal(service.plan(a, d).journeys.length, 1)
  assert.equal(service.plan({ ...a, allowedVisits: [{ ...a.allowedVisits[0], directionId: 'reverse' }] }, d).journeys.length, 0)
  assert.equal(service.plan(a, { ...d, allowedVisits: [{ ...d.allowedVisits[0], directionId: 'reverse' }] }).journeys.length, 0)
  assert.equal(service.plan({ ...a, allowedVisits: [] }, d).journeys.length, 0)
  assert.equal(service.plan(a, endpoint('x')).journeys.length, 1)
  assert.equal(service.plan(endpoint('x'), d).journeys.length, 1)
})

test('direction candidates are filtered before the nearest-six limit and preserve source occurrence', () => {
  const stops = Array.from({ length: 8 }, (_, i) => stop(`s${i}`, p(106.420 + i * .00001)))
  stops.push(stop('z', p(106.43)))
  const routes = stops.slice(0, 8).map((s, i) => route(`r${i}`, [s.coordinate, stops[8].coordinate], [visit(s.id, 0, 0, 0), visit('z', 0, 1, 1000)]))
  const service = createTransitJourneyService(dataset(stops, routes))
  const from = { kind: 'coordinate' as const, coordinate: p(106.42), allowedVisits: [{ routeId: 'r7', visitIndex: 0, directionId: 'forward' as const }] }
  assert.equal(service.plan(from, endpoint('z')).journeys[0]?.legs[0].boardingStopId, 's7')
  assert.equal(service.plan({ ...from, allowedVisits: [{ routeId: 'missing', visitIndex: 0, directionId: 'forward' }] }, endpoint('z')).journeys.length, 0)
})

test('reference constraints retain the selected occurrence of a repeated source stop', () => {
  const data = dataset([stop('a', p(106.42)), stop('b', p(106.421)), stop('c', p(106.423))], [
    route('r', [p(106.42), p(106.421), p(106.42), p(106.423)], [
      visit('a', 0, 0, 0), visit('b', 1, 0, 100), visit('a', 2, 0, 200), visit('c', 2, 1, 500),
    ]),
  ])
  const service = createTransitJourneyService(data)
  const a = { ...endpoint('a'), allowedVisits: [{ routeId: 'r', visitIndex: 0, directionId: 'forward' as const }] }
  assert.equal(service.plan(a, endpoint('c')).journeys[0].legs[0].boardingVisitIndex, 0)
  assert.equal(service.plan({ ...a, allowedVisits: [{ routeId: 'r', visitIndex: 0, directionId: 'reverse' }] }, endpoint('b')).journeys.length, 0)
  const later = { ...a, allowedVisits: [{ routeId: 'r', visitIndex: 2, directionId: 'reverse' as const }] }
  assert.equal(service.plan(later, endpoint('b')).journeys[0].legs[0].boardingVisitIndex, 2)
})

test('explicit direction rules cannot re-enable the quarantined 3B visit through a shared stop ID', () => {
  const route = currentTransitDataset.routes.find((r) => r.id === 'route_3b')!
  const index = route.visits.findIndex((v) => v.offsetMeters > 35)
  const from = { ...endpoint(route.visits[index].stopId), allowedVisits: [{ routeId: route.id, visitIndex: index, directionId: 'forward' as const }] }
  assert.equal(transitJourneyService.plan(from, endpoint(route.visits[0].stopId)).journeys.length, 0)
})

test('automatic boarding admits the inclusive 35-meter boundary and rejects nonfinite or negative offsets', () => {
  for (const [offsetMeters, eligible] of [[0, true], [35, true], [35.000001, false], [55, false], [-1, false], [NaN, false], [Infinity, false], [-Infinity, false]] as const) {
    assert.equal(isAutomaticBoardingVisit({ offsetMeters }), eligible, `offset ${offsetMeters}`)
  }
})

// These fixtures catch using endpoint coordinates as roads, losing reverse direction,
// or re-finding repeated stops by ID instead of retaining their visit occurrence.
test('direct and reverse journeys crop to projected anchors and retain internal source vertices', () => {
  const points = [p(106.420), p(106.421), p(106.422), p(106.423)]
  const data = dataset([
    stop('a', p(106.42025, 29.8102)), stop('b', p(106.421)), stop('c', p(106.42275)),
  ], [route('r', points, [visit('a', 0, .25, 25, 35), visit('b', 1, 0, 100), visit('c', 2, .75, 275)], ['轨迹发布范围未闭合'])])
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

test('two reference locations jointly choose reachable non-nearest boarding and alighting stops', () => {
  const a = p(106.420), b = p(106.440)
  const data = dataset([
    stop('near-origin', a), stop('board', p(106.4205)),
    stop('near-destination', b), stop('alight', p(106.4395)),
  ], [
    route('isolated-origin', [a, p(106.4201)], [visit('near-origin', 0, 0, 0)]),
    route('isolated-destination', [b, p(106.4401)], [visit('near-destination', 0, 0, 0)]),
    route('connected', [p(106.4205), p(106.4395)], [visit('board', 0, 0, 0), visit('alight', 0, 1, 1800)]),
  ])
  const service = createTransitJourneyService(data)
  const best = service.plan({ kind: 'coordinate', coordinate: a }, { kind: 'coordinate', coordinate: b }).journeys[0]
  assert.equal(best.legs[0].boardingStopId, 'board')
  assert.equal(best.legs[0].alightingStopId, 'alight')
  assert.ok(best.accessDistanceMeters > 40 && best.accessDistanceMeters < 60)
  assert.ok(best.egressDistanceMeters > 40 && best.egressDistanceMeters < 60)
  assert.deepEqual(service.plan(endpoint('near-origin'), endpoint('near-destination')).journeys, [], 'explicit stations remain exact')
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
  input.stops.length = 0
  const firstResult = service.plan(endpoint('a'), endpoint('b'))
  assert.equal(firstResult.journeys.length, 1)
  const first = firstResult.journeys[0]
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

test('off-route visits cannot be automatic endpoints but do not truncate source geometry or occurrence indices', () => {
  const a = p(106.410), x = p(106.420), d = p(106.430)
  const data = dataset([stop('a', a), stop('x', p(106.420, 29.8105)), stop('d', d)], [
    route('r', [a, x, d], [visit('a', 0, 0, 0), visit('x', 1, 0, 1000, 55), visit('d', 1, 1, 2000)]),
  ])
  const snapshot = JSON.stringify(data)
  const service = createTransitJourneyService(data)
  const fromX = service.plan(endpoint('x'), endpoint('d'))
  assert.deepEqual(fromX.journeys, [])
  assert.match(fromX.message, /待核对|核对/)
  assert.deepEqual(service.plan(endpoint('a'), endpoint('x')).journeys, [])
  const through = service.plan(endpoint('a'), endpoint('d')).journeys[0]
  assert.deepEqual(through.legs[0].stopIds, ['a', 'd'])
  assert.equal(through.legs[0].boardingVisitIndex, 0)
  assert.equal(through.legs[0].alightingVisitIndex, 2)
  assert.deepEqual(through.legs[0].points, [a, x, d])
  assert.equal(through.rideDistanceMeters, 2000)
  assert.ok(through.warnings.some((warning) => warning.includes('待核对') && warning.includes('55')))
  const reverse = service.plan(endpoint('d'), endpoint('a')).journeys[0].legs[0]
  assert.deepEqual(reverse.stopIds, ['d', 'a'])
  assert.deepEqual(reverse.points, [d, x, a])
  assert.equal(reverse.boardingVisitIndex, 2)
  assert.equal(reverse.alightingVisitIndex, 0)
  assert.equal(JSON.stringify(data), snapshot)
})

test('GPS candidates exclude stops whose only published visit is quarantined', () => {
  const a = p(106.410), x = p(106.420), d = p(106.430)
  const service = createTransitJourneyService(dataset([stop('a', a), stop('x', x), stop('d', d)], [
    route('r', [a, x, d], [visit('a', 0, 0, 0), visit('x', 1, 0, 1000, 55), visit('d', 1, 1, 2000)]),
  ]))
  const result = service.plan({ kind: 'coordinate', coordinate: x }, endpoint('d'))
  assert.deepEqual(result.journeys, [])
  assert.match(result.message, /800|核对|范围/)
})

test('quarantine is route-scoped and prevents either side of an otherwise exact-ID transfer', () => {
  const a = p(106.420), x = p(106.421), d = p(106.422)
  for (const [firstOffset, secondOffset] of [[55, 0], [0, 55]]) {
    const service = createTransitJourneyService(dataset([stop('a', a), stop('x', x), stop('d', d)], [
      route('first', [a, x], [visit('a', 0, 0, 0), visit('x', 0, 1, 100, firstOffset)]),
      route('second', [x, d], [visit('x', 0, 0, 0, secondOffset), visit('d', 0, 1, 100)]),
    ]))
    assert.deepEqual(service.plan(endpoint('a'), endpoint('d')).journeys, [])
    if (firstOffset === 0) {
      assert.equal(service.plan(endpoint('a'), endpoint('x')).journeys[0].legs[0].routeId, 'first')
      assert.deepEqual(service.plan(endpoint('x'), endpoint('d')).journeys, [])
    } else {
      assert.equal(service.plan(endpoint('x'), endpoint('d')).journeys[0].legs[0].routeId, 'second')
      assert.equal(service.plan({ kind: 'coordinate', coordinate: x }, endpoint('d')).journeys[0].legs[0].routeId, 'second')
      assert.deepEqual(service.plan(endpoint('a'), endpoint('x')).journeys, [])
      assert.deepEqual(service.plan(endpoint('x'), endpoint('a')).journeys, [])
    }
  }
})

test('published 3B 2号门 is quarantined for boarding and alighting while route 3 and other 3B stops stay usable', () => {
  const route3B = currentTransitDataset.routes.find((item) => item.id === 'route_3b')!
  const route3 = currentTransitDataset.routes.find((item) => item.id === 'route_3')!
  const gate2 = 'stop_d10213da43f348b4'
  const origin = route3B.visits[0].stopId
  const destination = route3B.visits[route3B.visits.length - 1].stopId
  const snapshot = JSON.stringify(currentTransitDataset)
  assert.ok(route3B.visits.find((item) => item.stopId === gate2)!.offsetMeters > 83)
  const only3B = createTransitJourneyService({ ...currentTransitDataset, routes: [route3B] })
  assert.deepEqual(only3B.plan(endpoint(gate2), endpoint(destination)).journeys, [])
  assert.deepEqual(only3B.plan(endpoint(origin), endpoint(gate2)).journeys, [])
  const ordinary3B = only3B.plan(endpoint(origin), endpoint(destination)).journeys[0].legs[0]
  assert.equal(ordinary3B.routeId, 'route_3b')
  assert.ok(!ordinary3B.stopIds.includes(gate2))
  assert.equal(ordinary3B.boardingVisitIndex, 0)
  assert.equal(ordinary3B.alightingVisitIndex, 18)
  const only3 = createTransitJourneyService({ ...currentTransitDataset, routes: [route3] })
  assert.equal(only3.plan(endpoint(gate2), endpoint(route3.visits[0].stopId)).journeys[0].legs[0].routeId, 'route_3')
  const combined = createTransitJourneyService({ ...currentTransitDataset, routes: [route3B, route3] })
  const fromSharedStop = combined.plan(endpoint(gate2), endpoint(origin)).journeys
  assert.ok(fromSharedStop.length)
  assert.ok(fromSharedStop.every((journey) => journey.legs.every((leg) =>
    leg.routeId !== 'route_3b' || (leg.boardingStopId !== gate2 && leg.alightingStopId !== gate2))))
  assert.equal(JSON.stringify(currentTransitDataset), snapshot)
})

test('published 3B cannot transfer at its quarantined 2号门 even when it is the only shared available visit', () => {
  const route3B = currentTransitDataset.routes.find((item) => item.id === 'route_3b')!
  const route3 = currentTransitDataset.routes.find((item) => item.id === 'route_3')!
  const gate2 = 'stop_d10213da43f348b4'
  const taoyuan = 'stop_303888fcc2579cea'
  const apartment = 'stop_ce61f1a750a9320c'
  // Restrict route 3 boarding choices to isolate this particular real shared stop;
  // both lines retain their complete published geometry and measured visit offsets.
  const restrictedRoute3 = { ...route3, visits: route3.visits.filter((item) => item.stopId === gate2 || item.stopId === taoyuan) }
  const service = createTransitJourneyService({ ...currentTransitDataset, routes: [route3B, restrictedRoute3] })
  assert.deepEqual(service.plan(endpoint(apartment), endpoint(taoyuan)).journeys, [])
  assert.deepEqual(service.plan(endpoint(taoyuan), endpoint(apartment)).journeys, [])
  assert.equal(service.plan(endpoint(gate2), endpoint(taoyuan)).journeys[0].legs[0].routeId, 'route_3')
})
