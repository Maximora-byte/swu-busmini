import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { BusStop, CampusPOI } from '../miniprogram/models/index'
import { createPoiRouteService } from '../miniprogram/services/navigation/poi-route.service'
import {
  createRouteRecommendationService,
  FLEXIBLE_CAMPUS_BUS_NOTE,
  routeRecommendationService,
} from '../miniprogram/services/navigation/route-recommendation.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticPoiRepository } from '../miniprogram/services/repository/poi.repository'
import {
  createStaticRouteRepository,
  routeRepository,
} from '../miniprogram/services/repository/route.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

test('recommends the correct route for a POI with a related stop', () => {
  const recommendations =
    routeRecommendationService.recommendRoutesForPoi('canteen_2')

  assert.equal(recommendations.length, 1)
  assert.equal(recommendations[0]?.routeId, 'route_4')
  assert.deepEqual(recommendations[0]?.matchedStopIds, ['canteen_2'])
  assert.deepEqual(recommendations[0]?.directions, ['图示正向', '图示反向'])
})

test('returns multiple routes for a POI related to multiple stops', () => {
  const stops: readonly BusStop[] = ['stop_a', 'stop_b'].map((id) => ({
    id,
    name: id,
    aliases: [],
    coordinate: null,
  }))
  const destination: CampusPOI = {
    id: 'multi_stop_poi',
    name: '多站点地点',
    aliases: [],
    category: 'other',
    relatedStopIds: ['stop_a', 'stop_b'],
    dataStatus: 'needs_review',
  }
  const stopRepository = createStaticBusStopRepository(stops)
  const routeRepository = createStaticRouteRepository([
    {
      id: 'route_a',
      name: 'A路',
      serviceType: 'fixed_stop',
      allowIntermediateStop: false,
      dataStatus: 'verified',
      directions: [
        { name: '正向', isLoop: false, stopIds: ['stop_a'] },
      ],
    },
    {
      id: 'route_b',
      name: 'B路',
      serviceType: 'fixed_stop',
      allowIntermediateStop: false,
      dataStatus: 'needs_review',
      directions: [
        { name: '正向', isLoop: false, stopIds: ['stop_b'] },
      ],
    },
  ])
  const poiRepository = createStaticPoiRepository([destination])
  const catalog = createRouteCatalogService(routeRepository, stopRepository)
  const poiRoutes = createPoiRouteService(poiRepository, catalog)
  const service = createRouteRecommendationService(poiRepository, poiRoutes)

  const recommendations = service.recommendRoutesForPoi(destination.id)

  assert.deepEqual(
    recommendations.map(({ routeId }) => routeId),
    ['route_a', 'route_b'],
  )
  assert.deepEqual(recommendations[0]?.matchedStopIds, ['stop_a'])
  assert.deepEqual(recommendations[1]?.matchedStopIds, ['stop_b'])
})

test('returns an empty recommendation list for a POI without related stops', () => {
  assert.deepEqual(
    routeRecommendationService.recommendRoutesForPoi('library'),
    [],
  )
})

test('adds a field confirmation note for flexible campus bus routes', () => {
  const [recommendation] =
    routeRecommendationService.recommendRoutesForPoi('canteen_2')

  assert.equal(recommendation?.serviceType, 'flexible_campus_bus')
  assert.equal(recommendation?.note, FLEXIBLE_CAMPUS_BUS_NOTE)
  assert.equal(recommendation?.dataStatus, 'needs_review')
})

test('throws a clear error for a POI that does not exist', () => {
  assert.throws(
    () => routeRecommendationService.recommendRoutesForPoi('missing_poi'),
    /未找到校园地点: missing_poi/,
  )
})

test('supports keyword search followed by route recommendation', () => {
  const results = routeRecommendationService.searchAndRecommend('第二食堂')

  assert.equal(results.length, 1)
  assert.equal(results[0]?.destination.name, '二食堂')
  assert.deepEqual(
    results[0]?.routes.map(({ routeName }) => routeName),
    ['4路'],
  )
})

test('recommendations only contain routes supplied by the Route Catalog', () => {
  const recommendations =
    routeRecommendationService.recommendRoutesForPoi('gate_5')
  const knownRouteIds = new Set(routeRepository.getAll().map(({ id }) => id))

  assert.equal(
    recommendations.every(({ routeId }) => knownRouteIds.has(routeId)),
    true,
  )
})
