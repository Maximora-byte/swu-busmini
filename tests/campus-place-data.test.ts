import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCampusMapPlaces } from '../scripts/campus-place-data'

const fixture = () => ({ schemaVersion: 1, places: [{ id: 'osm:node:1', name: '十一教学楼', aliases: ['11教'], category: 'teaching_building',
  coordinateSystem: 'WGS84', coordinate: { latitude: 29.82, longitude: 106.42 }, coordinateKind: 'mapped-node',
  osm: { type: 'node', id: 1, version: 1, timestamp: '2026-11-13T00:00:00Z' } }],
  guides: [{ id: 'guide:tianjiabing', name: '田家炳', aliases: ['信息办', '校园卡服务'], anchorId: 'osm:node:1', details: '服务位置在一楼。' },
    { id: 'guide:unlocated', name: '南区招聘大厅', aliases: ['大创中心'], anchorId: null, details: '入口需另行选择。' }] })

test('campus import converts original WGS84 once and merges only explicitly linked guide aliases', () => {
  const source = fixture(), original = JSON.stringify(source)
  const places = buildCampusMapPlaces(source)
  assert.equal(places.length, 2)
  assert.notEqual(places[0].coordinate!.longitude, source.places[0].coordinate.longitude)
  assert.ok(places[0].aliases.includes('校园卡服务'))
  assert.match(places[0].details!, /一楼/)
  assert.equal(places[1].coordinate, null)
  assert.equal(places[1].coordinateKind, 'unlocated-guide')
  assert.equal(JSON.stringify(source), original)
})

test('campus import rejects wrong coordinate systems, duplicate IDs and dangling guide links', () => {
  const mixed = fixture(); mixed.places[0].coordinateSystem = 'GCJ-02'
  assert.throws(() => buildCampusMapPlaces(mixed))
  const duplicate = fixture(); duplicate.places.push(duplicate.places[0])
  assert.throws(() => buildCampusMapPlaces(duplicate))
  const dangling = fixture(); dangling.guides[0].anchorId = 'osm:missing'
  assert.throws(() => buildCampusMapPlaces(dangling))
  const outside = fixture(); outside.places[0].coordinate.latitude = 39.9
  assert.throws(() => buildCampusMapPlaces(outside))
})
