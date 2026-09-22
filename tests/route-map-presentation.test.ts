import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { BusStop, RouteGeometryDataStatus } from '../miniprogram/models/index'
import {
  createRouteMapPresentationService,
  routeMapPresentationService,
} from '../miniprogram/services/map/route-map-presentation.service'
import { createRouteNavigationService } from '../miniprogram/services/navigation/route-navigation.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticRouteRepository } from '../miniprogram/services/repository/route.repository'
import { createStaticRouteGeometryRepository } from '../miniprogram/services/repository/route-geometry.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

function fixture(
  geometryStatus: RouteGeometryDataStatus = 'verified',
  stopIds = ['a', 'b', 'c', 'b', 'a'],
) {
  const stops: BusStop[] = [
    { id: 'a', name: 'A站', aliases: [], coordinate: { latitude: 29.8, longitude: 106.4, verified: true } },
    { id: 'b', name: 'B站', aliases: [], coordinate: { latitude: 29.81, longitude: 106.41, verified: true } },
    { id: 'c', name: 'C站', aliases: [], coordinate: { latitude: 29.82, longitude: 106.42, verified: false } },
  ]
  const routes = createStaticRouteRepository([{
    id: 'route_6',
    name: '6路',
    serviceType: 'flexible_campus_bus',
    allowIntermediateStop: true,
    dataStatus: 'needs_review',
    directions: [{
      name: '测试方向',
      isLoop: stopIds.length > 0,
      stopIds,
      ...(stopIds.length > 0 ? { allowedRepeatedStopIds: ['b'] } : {}),
    }],
  }])
  return createRouteMapPresentationService(createRouteNavigationService(
    createRouteCatalogService(routes, createStaticBusStopRepository(stops)),
    createStaticRouteGeometryRepository(stopIds.length > 0 ? [{
      routeId: 'route_6',
      directionId: '测试方向',
      source: 'test_fixture',
      dataStatus: geometryStatus,
      points: [{ latitude: 29.8, longitude: 106.4 }, { latitude: 29.81, longitude: 106.41 }],
    }] : [], routes),
  ))
}

test('presents all nine catalog routes with map-reference colors and selected state', () => {
  const options = routeMapPresentationService.getRouteOptions('route_4')
  assert.deepEqual(options.map(({ id }) => id), Array.from({ length: 9 }, (_, i) => `route_${i + 1}`))
  assert.deepEqual(options.filter(({ selected }) => selected).map(({ id }) => id), ['route_4'])
  for (const option of options) {
    const view = routeMapPresentationService.getRoutePresentation(option.id)
    assert.equal(view.routeName, option.name)
    assert.equal(view.routeColor, option.color)
    assert.ok(view.routeDirections.length > 0)
    assert.equal(view.routeStops[0].positionLabel, '起点')
    assert.match(view.routeServiceNote, /沿途停靠/)
    assert.deepEqual(view.busStopMarkers, [])
    assert.deepEqual(view.routePolylines, [])
  }
})

test('route 6 preserves repeated gate 2 and closure while distinguishing its loop directions', () => {
  const view = routeMapPresentationService.getRoutePresentation('route_6')
  assert.equal(view.routeKindText, '环线')
  assert.equal(view.routeSummary, '竹园 → 二号门 → 梅园 → … → 竹园')
  assert.equal(view.routeDirections[1].summary, '竹园 → 二号门 → 八教 → … → 竹园')
  assert.deepEqual(view.routeStops.filter(({ id }) => id === 'gate_2').map(({ positionLabel }) => positionLabel), ['', '再次经过'])
  assert.equal(view.routeStops[view.routeStops.length - 1].positionLabel, '返回起点')
  assert.equal(new Set(view.routeStops.map(({ key }) => key)).size, view.routeStops.length)
  assert.match(view.routeCoordinateStatusText, /^6 个参考站点/)
  const reverse = routeMapPresentationService.getRoutePresentation('route_6', view.routeDirections[1].id)
  assert.equal(reverse.routeDirections[1].selected, true)
  assert.equal(reverse.routeSummary, view.routeDirections[1].summary)
})

test('deduplicates verified stop markers without losing repeated visits and matches polyline color', () => {
  const view = fixture().getRoutePresentation('route_6')
  assert.equal(view.routeStops.length, 5)
  assert.deepEqual(view.busStopMarkers.map(({ title }) => title), ['A站', 'B站'])
  assert.equal(view.routeStops[2].hasVerifiedCoordinate, false)
  assert.match(view.routeCoordinateStatusText, /^1 个参考站点/)
  assert.equal(view.routePolylines.length, 1)
  assert.equal(view.routePolylines[0].color, view.routeColor)
  assert.deepEqual(view.routePolylines[0].points, [{ latitude: 29.8, longitude: 106.4 }, { latitude: 29.81, longitude: 106.41 }])
})

test('pending geometry stays off the map while known stop order remains available', () => {
  const view = fixture('needs_review').getRoutePresentation('route_6')
  assert.deepEqual(view.routePolylines, [])
  assert.equal(view.routeStops.length, 5)
  assert.match(view.routeGeometryStatusText, /待人工确认/)
})

test('an incomplete flexible route reports missing reference stops instead of claiming calibrated data', () => {
  const view = fixture('needs_review', []).getRoutePresentation('route_6')
  assert.deepEqual(view.routeStops, [])
  assert.equal(view.routeSummary, '已知参考站点待补充')
  assert.equal(view.routeCoordinateStatusText, '已知参考站点待补充')
})

test('unknown route and direction errors remain explicit for the page', () => {
  assert.throws(() => routeMapPresentationService.getRoutePresentation('route_missing'), /未找到线路/)
  assert.throws(() => routeMapPresentationService.getRoutePresentation('route_1', '不存在方向'), /不存在方向/)
})
