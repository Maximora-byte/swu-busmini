import assert from 'node:assert/strict'
import test from 'node:test'
import { currentTransitDataset } from '../miniprogram/data/current-transit'
import { createTransitStopSearchService } from '../miniprogram/services/navigation/transit-stop-search.service'
import type { TransitDataset } from '../miniprogram/models/current-transit'

const search = createTransitStopSearchService(currentTransitDataset)

test('local search accepts aliases, fullwidth input and Chinese gate/building numbers', () => {
  for (const [query, expectedName] of [
    [' 中 图 ', '中心图书馆'], ['经济管理学院', '经管院'], ['五号门', '5号门'],
    ['３２教学楼', '32教'], ['第三十二教学楼', '32教'], ['八教', '8教学楼'],
    ['橘园十一舍', '橘11'],
  ]) assert.ok(search.search(query).some(({ name }) => name === expectedName), query)
  assert.ok(search.search('图书').every(({ name }) => name.includes('图书')))
})

test('limited typo matching helps long queries without changing gate or building numbers', () => {
  assert.ok(search.search('图书官').some(({ name }) => name.includes('图书馆')))
  assert.ok(search.search('心里学部').some(({ name }) => name === '心理学部'))
  assert.deepEqual(search.search('心里'), [], 'short ambiguous queries do not guess typos')
  assert.deepEqual(search.search('52教学楼'), [], '32教 cannot become 52教 through a typo match')
  assert.ok(search.search('二号门').every(({ name }) => name.includes('2号门')))
})

test('exact names precede partial names while physical identities and valid lines stay distinct', () => {
  const results = search.search('中心图书馆')
  assert.equal(results[0].name, '中心图书馆')
  const gates = search.search('2号门')
  assert.ok(gates.length >= 2)
  assert.equal(new Set(gates.map(({ stopId }) => stopId)).size, gates.length)
  const route3Gate = gates.find(({ label }) => /3号线/.test(label) && !/4号线/.test(label))!
  assert.ok(route3Gate)
  assert.ok(!route3Gate.routeNames.includes('3路B线'))
  assert.ok(gates.some(({ routeNames }) => routeNames.includes('4号线')))
})

test('search excludes unused and entirely quarantined records and returns defensive suggestions', () => {
  const data = JSON.parse(JSON.stringify(currentTransitDataset)) as TransitDataset
  data.stops.push({ id: 'unused', name: '完全无服务', coordinate: { latitude: 29.82, longitude: 106.42 } })
  data.routes.forEach((route) => route.visits.forEach((visit) => {
    if (data.stops.find(({ id }) => id === visit.stopId)?.name === '校医院') visit.offsetMeters = 100
  }))
  const service = createTransitStopSearchService(data)
  assert.deepEqual(service.search('完全无服务'), [])
  assert.deepEqual(service.search('校医院'), [])
  const result = service.search('经管院')
  result[0].routeNames.length = 0
  data.stops[0].name = '后来修改'
  assert.ok(service.search('经管院')[0].routeNames.length)
})

test('empty, unrelated, oversized queries and broad result sets have bounded deterministic output', () => {
  assert.deepEqual(search.search('  '), [])
  assert.deepEqual(search.search('完全不存在的校外地点'), [])
  assert.deepEqual(search.search('图'.repeat(10000)), [])
  const result = search.search('院')
  assert.ok(result.length > 0 && result.length <= 12)
  assert.deepEqual(search.search('院'), result)
})

test('reports the actual bounded match rank for composing globally ordered search results', () => {
  const queries = [
    ['中心图书馆', 0], ['中图', 1], ['心理', 2], ['图书', 3], ['理学部', 4], ['图书官', 6],
  ] as const
  for (const [query, rank] of queries) assert.equal(search.search(query)[0].matchRank, rank, query)
  assert.deepEqual(search.search('52教学楼'), [], 'score metadata must not loosen numeric protection')
})
