import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { TransitDataset } from '../miniprogram/models/current-transit'
import { buildCurrentTransitDataset, sanitizeCurrentTransitSource, syncCurrentTransitData } from '../scripts/current-transit-data'
import safeSource from '../miniprogram/data/current-transit-source.json'
import publishedData from '../miniprogram/data/current-transit.json'
import { currentTransitDataset } from '../miniprogram/data/current-transit'

const names = ['1号线', '2号线', '3号线', '3路B线', '4号线', '5号线', '6号线', '7号线', '8号线', '经管专线']

function rawFixture() {
  return {
    stations: { source: 'unused', observedAt: '2026-11-13', schoolId: 'private-school', routes: names.map((name, index) => ({
      id: String(100 + index), name, account: 'private-account', points: [
        { name: '北站', lat: '29.820000', lng: '106.420000', sign: 'private-sign' },
        { name: '南站', lat: '29.821000', lng: '106.420000' },
      ],
    })) },
    geometry: { routes: names.map((name, index) => ({
      id: String(900 + index), line_id: String(100 + index), name, color: '1699e2',
      endpoint: 'private-endpoint', points: ['29.820000,106.420000', '29.821000,106.420000'],
    })) },
  }
}

function sourceFixture() {
  return {
    source: '享坐车 · 西南大学地图首页', observedAt: '2026-11-13', routes: [{
      id: 'route_1', name: '1号线', color: '#1699e2',
      stations: [
        { name: '北站', coordinate: { latitude: 29.82, longitude: 106.42 } },
        { name: '南站', coordinate: { latitude: 29.821, longitude: 106.42 } },
      ],
      points: [{ latitude: 29.82, longitude: 106.42 }, { latitude: 29.821, longitude: 106.42 }],
    }],
  }
}

test('static import pairs geometry by line identity and publishes only the allowlisted ten routes', async () => {
  const raw = rawFixture()
  raw.geometry.routes.reverse()
  const source = sanitizeCurrentTransitSource(raw.stations, raw.geometry)
  assert.deepEqual(source.routes.map((route: any) => route.id), ['route_1', 'route_2', 'route_3', 'route_3b', 'route_4', 'route_5', 'route_6', 'route_7', 'route_8', 'route_jingguan'])
  assert.equal(source.routes[0].color, '#1699e2')
  assert.deepEqual(Object.keys(source).sort(), ['observedAt', 'routes', 'source'])
  assert.deepEqual(Object.keys(source.routes[0]).sort(), ['color', 'id', 'name', 'points', 'stations'])
  assert.deepEqual(Object.keys(source.routes[0].stations[0]).sort(), ['coordinate', 'name'])
  assert.doesNotMatch(JSON.stringify(source), /private-|line_id|schoolId|account|endpoint|sign/)
  raw.geometry.routes[0].line_id = 'not-the-station-id'
  assert.throws(() => sanitizeCurrentTransitSource(raw.stations, raw.geometry), /identity|关联|匹配/)
})

test('static import rejects incomplete duplicate or unknown lines and malformed station/geometry coordinates', async () => {
  for (const mutate of [
    (raw: any) => raw.stations.routes.pop(),
    (raw: any) => raw.geometry.routes.push(raw.geometry.routes[0]),
    (raw: any) => { raw.stations.routes[1].id = raw.stations.routes[0].id },
    (raw: any) => { raw.stations.routes[0].name = '外地线路' },
    (raw: any) => { raw.geometry.routes[0].name = '错误线路' },
    (raw: any) => { raw.geometry.routes[0].points[0] = '39.9,116.4' },
    (raw: any) => { raw.stations.routes[0].points[0].lat = '' },
  ]) {
    const raw = rawFixture(); mutate(raw)
    assert.throws(() => sanitizeCurrentTransitSource(raw.stations, raw.geometry))
  }
})

test('projection sorts unsorted reference nodes by mileage while preserving original geometry and source indices', async () => {
  const source = sourceFixture()
  source.routes[0].stations.reverse()
  const dataset: TransitDataset = buildCurrentTransitDataset(source)
  assert.equal(dataset.quality, 'operator_published')
  assert.equal(dataset.coordinateSystem, 'GCJ-02')
  assert.deepEqual(dataset.routes[0].points, source.routes[0].points)
  assert.deepEqual(dataset.routes[0].visits.map(({ sourceIndex }) => sourceIndex), [1, 0])
  assert.deepEqual(dataset.routes[0].visits.map(({ segmentIndex, ratio }) => [segmentIndex, ratio]), [[0, 0], [0, 1]])
  assert.equal(dataset.routes[0].visits[0].mileageMeters, 0)
  assert.ok(dataset.routes[0].visits[1].mileageMeters > 111 && dataset.routes[0].visits[1].mileageMeters < 112)
  assert.ok(dataset.routes[0].visits.every(({ offsetMeters }) => offsetMeters < 0.01))
})

test('physical identity uses exact names and six-decimal coordinates rather than proximity', async () => {
  const source = sourceFixture()
  source.routes[0].stations.push(
    { name: '北站', coordinate: { latitude: 29.8200001, longitude: 106.42 } },
    { name: '北站', coordinate: { latitude: 29.820001, longitude: 106.42 } },
    { name: '另一站', coordinate: { latitude: 29.82, longitude: 106.42 } },
  )
  const first: TransitDataset = buildCurrentTransitDataset(source)
  const second: TransitDataset = buildCurrentTransitDataset(source)
  assert.equal(first.stops.length, 4)
  assert.equal(first.routes[0].visits.length, 5)
  assert.equal(first.routes[0].visits.find(({ sourceIndex }) => sourceIndex === 0)?.stopId,
    first.routes[0].visits.find(({ sourceIndex }) => sourceIndex === 2)?.stopId)
  assert.notEqual(first.routes[0].visits.find(({ sourceIndex }) => sourceIndex === 0)?.stopId,
    first.routes[0].visits.find(({ sourceIndex }) => sourceIndex === 3)?.stopId)
  assert.deepEqual(first, second)
})

test('projection warns above 35 meters and rejects over 150 meters, foreign placeholders and zero-length geometry', async () => {
  const source = sourceFixture()
  source.routes[0].stations[0].coordinate.longitude = 106.4205
  const dataset: TransitDataset = buildCurrentTransitDataset(source)
  assert.equal(dataset.routes[0].warnings.length, 1)
  assert.ok(dataset.routes[0].visits.some(({ offsetMeters }) => offsetMeters > 35 && offsetMeters < 150))
  source.routes[0].stations[0].coordinate.longitude = 106.422
  assert.throws(() => buildCurrentTransitDataset(source), /150|offset|偏离/)
  const foreign = sourceFixture(); foreign.routes[0].points[0].latitude = 31.2
  assert.throws(() => buildCurrentTransitDataset(foreign), /bounds|范围/)
  const zero = sourceFixture(); zero.routes[0].points[1] = zero.routes[0].points[0]
  assert.throws(() => buildCurrentTransitDataset(zero), /length|长度/)
})

test('sanitized source rejects unapproved extra fields and malformed dates instead of publishing them', async () => {
  for (const source of [
    { ...sourceFixture(), account: 'unapproved' },
    { ...sourceFixture(), observedAt: '2026-02-30' },
    { ...sourceFixture(), observedAt: '13/11/2026' },
    { ...sourceFixture(), routes: [] },
  ]) assert.throws(() => buildCurrentTransitDataset(source))
  const duplicate = sourceFixture(); duplicate.routes.push(duplicate.routes[0])
  assert.throws(() => buildCurrentTransitDataset(duplicate), /duplicate|重复/i)
})

test('dataset synchronization rebuilds from the sanitized source and check mode never repairs stale output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'swu-current-transit-'))
  await writeFile(join(directory, 'current-transit-source.json'), JSON.stringify(sourceFixture()))
  await assert.rejects(syncCurrentTransitData(directory, true), /sync|同步/)
  await syncCurrentTransitData(directory, false)
  const first = await readFile(join(directory, 'current-transit.json'), 'utf8')
  assert.equal(JSON.parse(first).quality, 'operator_published')
  await writeFile(join(directory, 'current-transit.ts'), '// stale')
  await assert.rejects(syncCurrentTransitData(directory, true), /sync|同步/)
  assert.equal(await readFile(join(directory, 'current-transit.ts'), 'utf8'), '// stale')
  await syncCurrentTransitData(directory, false)
  await syncCurrentTransitData(directory, true)
  assert.equal(await readFile(join(directory, 'current-transit.json'), 'utf8'), first)
})

test('the committed safe source reproduces both runtime mirrors without adding road points or private fields', () => {
  const built = buildCurrentTransitDataset(safeSource)
  assert.deepEqual(built, publishedData)
  assert.deepEqual(currentTransitDataset, publishedData)
  for (const [index, route] of built.routes.entries()) {
    assert.deepEqual(route.points, safeSource.routes[index].points)
    assert.deepEqual(Object.keys(route).sort(), ['color', 'id', 'name', 'points', 'visits', 'warnings'])
    assert.deepEqual(Object.keys(safeSource.routes[index]).sort(), ['color', 'id', 'name', 'points', 'stations'])
    for (const station of safeSource.routes[index].stations) {
      assert.deepEqual(Object.keys(station).sort(), ['coordinate', 'name'])
      assert.deepEqual(Object.keys(station.coordinate).sort(), ['latitude', 'longitude'])
    }
    for (const visit of route.visits) {
      assert.deepEqual(Object.keys(visit).sort(), ['mileageMeters', 'offsetMeters', 'ratio', 'segmentIndex', 'sourceIndex', 'stopId'])
    }
  }
  assert.doesNotMatch(JSON.stringify(safeSource), /schoolId|school_id|line_id|sign|account|endpoint|[A-Z]:\\\\/)
})
