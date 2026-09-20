import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import poisData from '../miniprogram/data/pois.json'
import type { BusStop, CampusPOI } from '../miniprogram/models/index'
import { poiRouteService } from '../miniprogram/services/navigation/poi-route.service'
import {
  busStopRepository,
} from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticPoiRepository } from '../miniprogram/services/repository/poi.repository'
import { validatePoiData } from '../miniprogram/services/validation/poi-data-validator'

const stops: readonly BusStop[] = [
  {
    id: 'known_stop',
    name: '已知站点',
    aliases: [],
    coordinate: null,
  },
]

const validPoi: CampusPOI = {
  id: 'test_poi',
  name: '测试地点',
  aliases: ['地点别名'],
  category: 'other',
  relatedStopIds: ['known_stop'],
  dataStatus: 'needs_review',
}

test('accepts the checked-in POI dataset', () => {
  const result = validatePoiData(poisData, busStopRepository.getAll())

  assert.equal(result.valid, true)
  assert.deepEqual(result.issues, [])
})

test('reports a POI reference to an unknown stop', () => {
  const result = validatePoiData(
    [{ ...validPoi, relatedStopIds: ['unknown_stop'] }],
    stops,
  )

  assert.equal(
    result.issues.find(({ code }) => code === 'unknown_stop')?.stopId,
    'unknown_stop',
  )
})

test('reports duplicate POI ids', () => {
  const result = validatePoiData([validPoi, validPoi], stops)

  assert.equal(
    result.issues.find(({ code }) => code === 'duplicate_poi_id')?.poiId,
    'test_poi',
  )
})

test('searches POIs by alias', () => {
  const repository = createStaticPoiRepository([validPoi])

  assert.deepEqual(
    repository.search('地点别名').map(({ id }) => id),
    ['test_poi'],
  )
  assert.deepEqual(repository.search('  '), [])
})

test('reports an empty POI alias', () => {
  const result = validatePoiData([{ ...validPoi, aliases: ['   '] }], stops)

  assert.equal(result.issues.some(({ code }) => code === 'empty_alias'), true)
})

test('reports an invalid POI category', () => {
  const result = validatePoiData(
    [{ ...validPoi, category: 'unknown_category' }],
    stops,
  )

  assert.equal(
    result.issues.some(({ code }) => code === 'invalid_category'),
    true,
  )
})

test('requires a valid POI data status', () => {
  const { dataStatus: _dataStatus, ...poiWithoutStatus } = validPoi
  const result = validatePoiData([poiWithoutStatus], stops)

  assert.equal(
    result.issues.some(({ code }) => code === 'invalid_data_status'),
    true,
  )
})

test('resolves routes from a POI through related stops', () => {
  const result = poiRouteService.getRoutesForPoi('canteen_2')

  assert.equal(result.poi.name, '二食堂')
  assert.deepEqual(
    result.routes.map(({ id }) => id),
    ['route_4'],
  )
})

test('returns no routes when a POI has no verified stop relationship', () => {
  const result = poiRouteService.getRoutesForPoi('library')

  assert.deepEqual(result.poi.relatedStopIds, [])
  assert.deepEqual(result.routes, [])
})
