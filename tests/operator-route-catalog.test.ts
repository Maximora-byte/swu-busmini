import assert from 'node:assert/strict'
import test from 'node:test'
import type { OperatorRouteObservation as Observation } from '../miniprogram/models/index'
import {
  createOperatorRouteCatalogRepository as create,
  operatorRouteCatalogRepository as repository,
} from '../miniprogram/services/repository/operator-route-catalog.repository'

function observation(): Observation {
  return {
    id: 'route_3b', name: '3路B线', source: '享坐车 · 西南大学地图首页',
    observedAt: '2026-11-13', confirmation: '用户确认线路名称与地图参考点准确',
    referencePointNames: ['后山竹园', '橘园新七舍', '四新村博士生公寓'],
  }
}

test('current catalog exposes ten observed names in operator order without adding historical route 9', async () => {
  assert.deepEqual(repository.getAll().map(({ id, name }) => [id, name]), [
    ['route_1', '1号线'], ['route_2', '2号线'], ['route_3', '3号线'], ['route_3b', '3路B线'],
    ['route_4', '4号线'], ['route_5', '5号线'], ['route_6', '6号线'], ['route_7', '7号线'],
    ['route_8', '8号线'], ['route_jingguan', '经管专线'],
  ])
  assert.equal(repository.getById('route_9'), undefined)
  assert.equal(repository.getById('missing'), undefined)
  assert.equal(repository.getById('toString'), undefined)
})

test('catalog preserves composite reference labels and the complete B-line and dedicated-line observations', async () => {
  assert.deepEqual(repository.getById('route_3b')?.referencePointNames, [
    '后山竹园', '32教', '共青花园2号门', '2号门', '楠园', '校史馆', '大礼堂', '研究生院',
    '中心图书馆地科院', '地科院', '心理学部', '外国语学院', '药学院', '梅园', '梅园食堂',
    '橘园新七舍', '四新村博士生公寓', '外办', '5号门',
  ])
  assert.deepEqual(repository.getById('route_jingguan')?.referencePointNames, [
    '经管院', '资环院', '32教', '共青花园、2号门', '楠园',
  ])
  assert.ok(repository.getById('route_1')?.referencePointNames.includes('共青团花园2号门'))
  assert.ok(repository.getById('route_2')?.referencePointNames.includes('8教李园'))
  assert.deepEqual(repository.getAll().map(({ referencePointNames }) => referencePointNames.length), [16, 15, 22, 19, 15, 13, 22, 20, 15, 5])
})

test('each current observation carries a date and confirmation limited to route names and map labels', async () => {
  for (const record of repository.getAll()) {
    assert.equal(record.source, '享坐车 · 西南大学地图首页')
    assert.equal(record.observedAt, '2026-11-13')
    assert.equal(record.confirmation, '用户确认线路名称与地图参考点准确')
    assert.deepEqual(Object.keys(record).sort(), ['confirmation', 'id', 'name', 'observedAt', 'referencePointNames', 'source'])
  }
})

test('repository owns its input and returns defensive record and label copies', async () => {
  const input = [observation()]
  const repository = create(input)
  input[0].name = 'changed input'
  input[0].referencePointNames[0] = 'changed input label'
  const all = repository.getAll()
  all[0].name = 'changed output'
  all[0].referencePointNames.splice(0)
  all.push(observation())
  const selected = repository.getById('route_3b')!
  selected.name = 'changed selection'
  selected.referencePointNames.push('changed selection label')
  assert.deepEqual(repository.getAll(), [observation()])
  assert.deepEqual(repository.getById('route_3b'), observation())
})

test('rejects duplicate catalog IDs and empty or duplicate reference labels', async () => {
  assert.throws(() => create([observation(), observation()]), /duplicate|重复/i)
  for (const labels of [[], [''], ['  '], ['甲', '甲'], ['甲', ' 甲 '], [null], '甲']) {
    assert.throws(() => create([{ ...observation(), referencePointNames: labels }]), /referencePointNames|参考点/)
  }
})

test('rejects malformed records and missing or blank required metadata', async () => {
  for (const invalid of [null, {}, 'catalog', [null], [[]]]) assert.throws(() => create(invalid))
  for (const field of ['id', 'name', 'source', 'observedAt', 'confirmation']) {
    for (const invalid of [undefined, null, '', '  ', 3]) {
      assert.throws(() => create([{ ...observation(), [field]: invalid }]), new RegExp(field))
    }
  }
})

test('requires real ISO calendar dates instead of rolled-over or locale dates', async () => {
  for (const observedAt of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-11-31', '2026-1-01', '11/13/2026', '2026-11-13T03:00:00Z']) {
    assert.throws(() => create([{ ...observation(), observedAt }]), /observedAt/)
  }
  assert.equal(create([{ ...observation(), observedAt: '2024-02-29' }]).getAll()[0].observedAt, '2024-02-29')
})

test('unrelated input fields cannot leak navigation IDs, coordinates or private metadata into observations', async () => {
  const repository = create([{ ...observation(), stopIds: ['guessed-stop'], coordinate: { latitude: 29.8, longitude: 106.4 }, account: 'private' }])
  assert.deepEqual(repository.getAll(), [observation()])
})
