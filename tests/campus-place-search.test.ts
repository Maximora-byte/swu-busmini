import assert from 'node:assert/strict'
import test from 'node:test'
import type { Coordinate } from '../miniprogram/models/index'
import type { TransitDataset } from '../miniprogram/models/current-transit'
import { currentTransitDataset } from '../miniprogram/data/current-transit'
import { createCampusPlaceSearchService, type CampusMapPlace } from '../miniprogram/services/navigation/campus-place-search.service'

const center: Coordinate = { latitude: 29.82, longitude: 106.42 }

function dataset(): TransitDataset {
  return {
    id: 'synthetic-campus', source: '测试公布站点', observedAt: '2026-11-13', coordinateSystem: 'GCJ-02', quality: 'operator_published',
    stops: [
      { id: 'library', name: '中心图书馆', coordinate: { ...center } },
      { id: 'building32', name: '32教', coordinate: { latitude: 29.821, longitude: 106.42 } },
      { id: 'gate5', name: '5号门', coordinate: { latitude: 29.822, longitude: 106.42 } },
      { id: 'fourth', name: '第四站', coordinate: { latitude: 29.823, longitude: 106.42 } },
      { id: 'far', name: '远处站', coordinate: { latitude: 29.83, longitude: 106.42 } },
      { id: 'unused', name: '无服务站', coordinate: { ...center } },
    ],
    routes: [{
      id: 'line', name: '测试线', color: '#000000', points: [{ ...center }], warnings: [],
      visits: ['library', 'building32', 'gate5', 'fourth', 'far'].map((stopId, sourceIndex) => ({
        stopId, sourceIndex, segmentIndex: 0, ratio: 0, mileageMeters: sourceIndex * 100, offsetMeters: 0,
      })),
    }],
  }
}

function place(id: string, name: string, aliases: string[] = [], coordinate: Coordinate = center): CampusMapPlace {
  return { id, name, aliases, coordinate: { ...coordinate }, sourceLabel: 'OSM 校园地图', coordinateKind: 'mapped-node' }
}

test('combines supplied places and published stop aliases with real coordinates and source labels', () => {
  const data = dataset()
  const service = createCampusPlaceSearchService(data, [place('museum', '西南大学历史博物馆', ['校史馆'])])
  const results = service.search('校史馆')
  assert.equal(results.length, 1)
  assert.equal(results[0].kind, 'place')
  assert.equal(results[0].placeId, 'museum')
  assert.deepEqual(results[0].coordinate, center)
  assert.equal(results[0].sourceLabel, 'OSM 校园地图')
  assert.deepEqual(results[0].nearbyStops.map(({ stopId }) => stopId), ['library', 'building32', 'gate5'])
  assert.deepEqual(results[0].routeNames, ['测试线'])
  const stop = service.search('中图')[0]
  assert.equal(stop.kind, 'stop')
  assert.equal(stop.stopId, 'library')
  assert.deepEqual(stop.coordinate, data.stops[0].coordinate)
  assert.equal(stop.sourceLabel, '测试公布站点')
  assert.deepEqual(service.search('无服务站'), [])
})

test('normalizes fullwidth, Chinese building and gate numbers without guessing a different numeric identity', () => {
  const service = createCampusPlaceSearchService(dataset(), [
    place('building52', '52教学楼'), place('gate2', '2号门自习室'), place('building320', '320教'),
  ])
  assert.deepEqual(service.search(' 第三十二教学楼 ').map(({ stopId }) => stopId), ['building32'])
  assert.deepEqual(service.search('３２教学楼').map(({ stopId }) => stopId), ['building32'])
  assert.deepEqual(service.search('第五大门').map(({ stopId }) => stopId), ['gate5'])
  assert.deepEqual(service.search('五十二教').map(({ placeId }) => placeId), ['building52'])
  assert.deepEqual(service.search('二号门').map(({ placeId }) => placeId), ['gate2'])
  assert.deepEqual(service.search('３教学楼'), [])
  assert.deepEqual(service.search('42教学楼'), [])
})

test('allows one bounded typo or transposition for long place queries while short queries remain literal', () => {
  const service = createCampusPlaceSearchService(dataset(), [place('psychology', '心理学部'), place('museum', '校史博物馆')])
  assert.ok(service.search('图书官').some(({ stopId }) => stopId === 'library'))
  assert.deepEqual(service.search('心里学部').map(({ placeId }) => placeId), ['psychology'])
  assert.deepEqual(service.search('校史物博馆').map(({ placeId }) => placeId), ['museum'])
  assert.deepEqual(service.search('心里'), [])
  assert.deepEqual(service.search('校园博物官'), [])
})

test('ranks canonical, alias, prefix, substring and typo globally across stops and places', () => {
  const data = dataset()
  data.stops[0].name = '校史馆东站'
  const service = createCampusPlaceSearchService(data, [
    place('substring', '大学校史馆'), place('typo', '校史官'),
    place('alias', '大学博物馆', ['校史馆']), place('exact', '校史馆'),
  ])
  assert.deepEqual(service.search('校史馆').map(({ stopId, placeId }) => stopId ?? placeId), [
    'exact', 'alias', 'library', 'substring', 'typo',
  ])
})

test('a station typo through a private alias cannot outrank exact, prefix or substring POI matches', () => {
  const service = createCampusPlaceSearchService(dataset(), [
    place('substring', '校园图书官'), place('prefix', '图书官入口'), place('exact', '图书官'),
  ])
  assert.deepEqual(service.search('图书官').map(({ stopId, placeId }) => stopId ?? placeId), [
    'exact', 'prefix', 'substring', 'library',
  ])
  assert.deepEqual(service.search('52教'), [], 'sharing a fuzzy rank does not relax numeric identity')
})

test('preserves same-name different-position places and deterministically bounds mixed results', () => {
  const places = Array.from({ length: 20 }, (_, index) => place(`building-${index}`, '校园楼', [], {
    latitude: 29.82 + index * 0.00001, longitude: 106.42,
  }))
  const data = dataset()
  data.stops[0].name = '校园楼'
  const service = createCampusPlaceSearchService(data, places)
  const first = service.search('校园楼')
  assert.equal(first.length, 12)
  assert.equal(new Set(first.map(({ id }) => id)).size, 12)
  assert.equal(first[0].stopId, 'library')
  assert.deepEqual(first.slice(1).map(({ placeId }) => placeId), Array.from({ length: 11 }, (_, i) => `building-${i}`))
  assert.notDeepEqual(first[1].coordinate, first[2].coordinate)
  assert.deepEqual(service.search('校园楼'), first)
})

test('nearby uses direct spherical distance, limits to three unique eligible stops and excludes beyond 800 meters', () => {
  const data = dataset()
  data.routes[0].visits.push({ ...data.routes[0].visits[0] })
  const service = createCampusPlaceSearchService(data, [])
  const nearby = service.nearby(center)
  assert.deepEqual(nearby.map(({ stopId }) => stopId), ['library', 'building32', 'gate5'])
  assert.equal(nearby[0].distanceMeters, 0)
  assert.ok(Math.abs(nearby[1].distanceMeters - 111.195) < 0.01)
  assert.ok(nearby.every(({ distanceMeters }) => distanceMeters <= 800))
  assert.deepEqual(service.nearby({ latitude: 29.8373, longitude: 106.42 }), [])
  assert.equal(service.nearby({ latitude: 29.837, longitude: 106.42 })[0].stopId, 'far')
})

test('published gate keeps valid route names while excluding its quarantined 3B visit', () => {
  const service = createCampusPlaceSearchService(currentTransitDataset, [])
  const gate = service.search('2号门').find(({ routeNames }) => routeNames.includes('3号线') && !routeNames.includes('4号线'))!
  assert.ok(gate)
  assert.ok(!gate.routeNames.includes('3路B线'))
  const nearby = service.nearby(gate.coordinate!).find(({ stopId }) => stopId === gate.stopId)!
  assert.ok(nearby)
  assert.ok(nearby.routeNames.includes('3号线'))
  assert.ok(!nearby.routeNames.includes('3路B线'))
  const data = dataset()
  data.routes[0].visits[0].offsetMeters = 36
  assert.ok(!createCampusPlaceSearchService(data, []).nearby(center).some(({ stopId }) => stopId === 'library'))
})

test('invalid coordinates and empty, unrelated or oversized queries yield no fabricated positions', () => {
  const data = dataset()
  data.stops[0].coordinate.latitude = NaN
  const service = createCampusPlaceSearchService(data, [
    place('invalid', '错误地点', [], { latitude: Infinity, longitude: 106.42 }),
    place('outside', '越界地点', [], { latitude: 29.82, longitude: 181 }),
  ])
  for (const query of ['', '  ', '错'.repeat(65), '无此校外街道', '错误地点', '越界地点', '中图']) {
    assert.deepEqual(service.search(query), [], query)
  }
  for (const coordinate of [{ latitude: NaN, longitude: 106.42 }, { latitude: 91, longitude: 106.42 }]) {
    assert.deepEqual(service.nearby(coordinate), [])
  }
})

test('snapshots supplied names, aliases, coordinates and route eligibility and returns independent result objects', () => {
  const data = dataset()
  const places = [place('museum', '校史馆', ['博物馆'])]
  const service = createCampusPlaceSearchService(data, places)
  data.stops[0].coordinate.latitude = 0
  data.stops[0].name = '被修改'
  data.routes[0].name = '被修改'
  data.routes[0].visits[0].offsetMeters = 100
  places[0].name = '被修改'
  places[0].aliases.length = 0
  places[0].coordinate!.latitude = 0
  const result = service.search('博物馆')[0]
  assert.equal(result.name, '校史馆')
  assert.deepEqual(result.coordinate, center)
  assert.deepEqual(result.routeNames, ['测试线'])
  result.coordinate!.latitude = 0
  result.routeNames.length = 0
  result.nearbyStops[0].name = '被修改'
  result.nearbyStops[0].routeNames.length = 0
  const fresh = service.search('博物馆')[0]
  assert.deepEqual(fresh.coordinate, center)
  assert.deepEqual(fresh.routeNames, ['测试线'])
  assert.equal(fresh.nearbyStops[0].name, '中心图书馆')
  assert.deepEqual(fresh.nearbyStops[0].routeNames, ['测试线'])
  const nearby = service.nearby(center)
  nearby[0].routeNames.length = 0
  assert.deepEqual(service.nearby(center)[0].routeNames, ['测试线'])
  assert.deepEqual(service.search('中图')[0].coordinate, center)
})

test('name-only campus guides match supplied aliases and services while requiring a selected position', () => {
  const guide: CampusMapPlace = {
    id: 'student-service', name: '学生事务服务中心', aliases: ['学生中心', '学籍办理'],
    coordinate: null, coordinateKind: 'unlocated-guide', sourceLabel: '校园办事指南',
    details: '二楼入口办理，窗口以现场通知为准',
  }
  const service = createCampusPlaceSearchService(dataset(), [guide])
  for (const query of ['学生中心', '学籍办理']) {
    const results = service.search(query)
    assert.equal(results.length, 1)
    const result = results[0]
    assert.equal(result.kind, 'place')
    assert.equal(result.placeId, 'student-service')
    assert.equal(result.stopId, undefined)
    assert.equal(result.coordinate, null)
    assert.deepEqual(result.nearbyStops, [])
    assert.deepEqual(result.routeNames, [])
    assert.match(result.label, /需选位置|暂无坐标/)
    assert.equal(result.details, '二楼入口办理，窗口以现场通知为准')
  }
  assert.deepEqual(service.search('窗口以现场通知为准'), [], 'notes do not become uncurated search aliases')
})

test('a guide with malformed nonnull coordinates is rejected instead of becoming an unlocated match', () => {
  const service = createCampusPlaceSearchService(dataset(), [{
    id: 'bad-guide', name: '错误办事中心', aliases: ['错误服务'], sourceLabel: '校园办事指南',
    coordinateKind: 'unlocated-guide', coordinate: { latitude: NaN, longitude: 106.42 },
  }])
  assert.deepEqual(service.search('错误服务'), [])
  assert.deepEqual(service.search('错误办事中心'), [])
})

test('explicit building, campus district and dormitory garden identities never cross through fuzzy matching', () => {
  const names = ['荟文楼A栋', '荟文楼B栋', '南区图书馆', '北区图书馆', ...['橘', '楠', '梅', '桃', '李', '杏'].map((garden) => `${garden}园11舍`)]
  const data = dataset()
  data.stops = names.map((name, index) => ({ id: `qualified-${index}`, name, coordinate: { ...center } }))
  data.routes[0].visits = data.stops.map(({ id }, sourceIndex) => ({
    stopId: id, sourceIndex, segmentIndex: 0, ratio: 0, mileageMeters: sourceIndex * 10, offsetMeters: 0,
  }))
  const places = names.map((name, index) => place(`qualified-${index}`, name))
  // A neutral alias must not bypass a contradictory canonical identity.
  places[0].aliases = ['荟文楼B']
  const service = createCampusPlaceSearchService(data, places)
  for (const query of names) {
    const results = service.search(query)
    assert.equal(results.length, 2, query)
    assert.ok(results.every(({ name }) => name === query), query)
    assert.deepEqual(new Set(results.map(({ kind }) => kind)), new Set(['stop', 'place']))
  }
  assert.ok(service.search('荟文楼Ｂ幢').every(({ name }) => name === '荟文楼B栋'), 'a suffix variant does not fuzzy-cross qualified wings')
  assert.ok(service.search('荟文楼').some(({ name }) => name === '荟文楼A栋'))
  assert.ok(service.search('荟文楼').some(({ name }) => name === '荟文楼B栋'))
  assert.ok(service.search('图书馆').some(({ name }) => name === '南区图书馆'))
  assert.ok(service.search('图书馆').some(({ name }) => name === '北区图书馆'))
})

test('identity protection uses explicit qualifiers and preserves ordinary service words and useful typos', () => {
  const service = createCampusPlaceSearchService(dataset(), [
    place('north-service', '北区服务中心', ['西南大学学生服务', '南北交流服务']), place('psychology', '心理学部'),
  ])
  for (const query of ['西南大学学生服务', '南北交流服务']) {
    assert.deepEqual(service.search(query).map(({ placeId }) => placeId), ['north-service'])
  }
  assert.ok(service.search('图书官').some(({ stopId }) => stopId === 'library'))
  assert.deepEqual(service.search('心里学部').map(({ placeId }) => placeId), ['psychology'])
  assert.deepEqual(service.search('52教'), [])
})
