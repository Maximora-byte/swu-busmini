import assert from 'node:assert/strict'
import test from 'node:test'
import type { BusRoute, BusStop } from '../miniprogram/models/index'
import { matchPreviewPlaces } from '../miniprogram/services/map/preview-place-matching'
import { createEmptyRoutePreviewCache, generateRoutePreview } from '../miniprogram/services/map/route-preview-generator.service'
import { TencentMapProvider, type TencentPlaceCandidate } from '../miniprogram/services/map/tencent/tencent-map.provider'

const stop: BusStop = { id: 'building_26', name: '二十六教', aliases: ['26教'], coordinate: null }
const point = { latitude: 29.822797, longitude: 106.422119 }
const place: TencentPlaceCandidate = { id: 'test-place', title: '西南大学(北碚校区)26号教学楼', address: '重庆市北碚区西南大学', coordinate: point }

test('exact campus POI matching normalizes numeric teaching-building names without matching school/shops/entrances', () => {
  assert.deepEqual(matchPreviewPlaces(stop, [
    { ...place, id: 'school', title: '西南大学(北碚校区)' },
    { ...place, id: 'gate', title: '西南大学26教学楼-南门' },
    { ...place, id: 'shop', title: '西南大学26教学楼便利店' },
    { ...place, id: 'elsewhere', title: '26号教学楼', address: '其他大学' },
    place,
  ]), [place])
})

test('Tencent place search retains source evidence and limits requests to Beibei without scope expansion', async () => {
  const provider = new TencentMapProvider({ key: 'test-key', requestClient: {
    async get(url, parameters) {
      assert.equal(url, 'https://apis.map.qq.com/ws/place/v1/search')
      assert.deepEqual(parameters, { key: 'test-key', keyword: '西南大学26教学楼', boundary: 'region(北碚区,2)', page_size: 20, page_index: 1 })
      return { status: 0, data: [{ id: place.id, title: place.title, address: place.address, location: { lat: point.latitude, lng: point.longitude } }] }
    },
  } })
  assert.deepEqual(await provider.searchPlaces('西南大学26教学楼'), [place])
})

test('Tencent place search rejects failed/malformed/out-of-range responses and accepts an empty list', async () => {
  for (const response of [{ status: 0, data: null }, { status: 120, message: 'limit' }, { status: 0, data: [{ ...place, location: { lat: 99, lng: 106 } }] }]) {
    const provider = new TencentMapProvider({ key: 'test-key', requestClient: { async get() { return response } } })
    await assert.rejects(() => provider.searchPlaces('西南大学'))
  }
  const provider = new TencentMapProvider({ key: 'test-key', requestClient: { async get() { return { status: 0, data: [] } } } })
  assert.deepEqual(await provider.searchPlaces('不存在地点'), [])
})

test('exact-place preview refuses ambiguous matches and never falls back to school-centre geocoding', async () => {
  const route: BusRoute = { id: 'r', name: '测试', serviceType: 'fixed_stop', allowIntermediateStop: false, dataStatus: 'needs_review', directions: [{ name: 'forward', stopIds: [stop.id, 'other'], isLoop: false }] }
  const second = { ...stop, id: 'other', name: '其他站', aliases: [] }
  for (const searchResult of [[], [place, { ...place, id: 'conflicting', coordinate: { latitude: 29.83, longitude: 106.43 } }]]) {
    const result = await generateRoutePreview([route], [stop, second], {
      async geocode() { assert.fail('strict POI search must not call geocoder') },
      async drivingRoute() { assert.fail('ambiguous coordinates must not be routed') },
      async searchPlaces() { return searchResult },
    }, undefined, undefined, { usePlaceSearch: true })
    assert.equal(result.segments.length, 0)
    assert.ok(result.candidates.every((candidate) => candidate.usableForPreview === false))
  }
})

test('exact-place preview caches searches and directions, retaining unverified title/address evidence', async () => {
  const destination = { latitude: 29.823, longitude: 106.423 }
  const second: BusStop = { id: 'library', name: '中心图书馆', aliases: ['中图'], coordinate: null }
  const route: BusRoute = { id: 'r', name: '测试', serviceType: 'fixed_stop', allowIntermediateStop: false, dataStatus: 'needs_review', directions: [{ name: 'forward', stopIds: [stop.id, second.id], isLoop: false }] }
  let searches = 0
  let driving = 0
  const provider = {
    async geocode() { assert.fail('must use exact places') },
    async searchPlaces(keyword: string) {
      searches += 1
      return keyword.includes('26') ? [place] : [{ ...place, id: 'library-place', title: '西南大学中心图书馆', coordinate: destination }]
    },
    async drivingRoute() { driving += 1; return { distanceMeters: 50, durationSeconds: 60, polyline: [point, destination] } },
  }
  const cache = createEmptyRoutePreviewCache()
  const result = await generateRoutePreview([route], [stop, second], provider, cache, undefined, { usePlaceSearch: true })
  await generateRoutePreview([route], [stop, second], provider, cache, undefined, { usePlaceSearch: true })
  assert.equal(searches, 2)
  assert.equal(driving, 1)
  assert.equal(result.candidates[0]?.placeEvidence?.title, place.title)
  assert.ok(result.candidates.every((candidate) => candidate.candidate?.verified === false))
  assert.equal(result.segments[0]?.dataStatus, 'needs_review')
  assert.equal(stop.coordinate, null)
})
