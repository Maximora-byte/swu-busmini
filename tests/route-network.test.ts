import assert from 'node:assert/strict'
import test from 'node:test'
import { createRouteNetworkService } from '../miniprogram/services/map/route-network.service'
import { routeMapPresentationService } from '../miniprogram/services/map/route-map-presentation.service'
import type { RoutePreviewSegment } from '../miniprogram/services/map/route-preview.types'

const segments: RoutePreviewSegment[] = [1, 2].map((number) => ({
  routeId: `route_${number}`, directionId: '图示正向', fromStopId: 'jingguanyuan', toStopId: 'gate_6',
  source: 'tencent_driving', dataStatus: 'needs_review',
  points: [{ latitude: 29.82, longitude: 106.42 }, { latitude: 29.83, longitude: 106.43 }],
}))
const service = createRouteNetworkService(routeMapPresentationService, {
  getSegments: (routeId, directionId) => segments.filter((segment) => segment.routeId === routeId && segment.directionId === directionId),
})

test('experimental network stays hidden unless explicitly requested and never adds markers', () => {
  const view = service.getOverlay({ selectedRouteId: 'route_1', showAllRoutes: true, includePreview: false })
  assert.equal(view.polylines.length, 0)
  assert.equal(view.legend.length, 9)
  assert.equal(view.fitPoints.length, 0)
  assert.equal(routeMapPresentationService.getRoutePresentation('route_1').busStopMarkers.length, 0)
})

test('network uses map-reference colors and dashed segments with selected route on top', () => {
  const view = service.getOverlay({ selectedRouteId: 'route_1', showAllRoutes: true, includePreview: true })
  assert.equal(view.polylines.length, 2)
  assert.ok(view.polylines.every((line) => line.dottedLine))
  assert.deepEqual(view.polylines.map((line) => line.color), ['#f0cf4a', '#2e774c'])
  assert.ok(view.polylines[1].width > view.polylines[0].width)
  assert.equal(view.legend[0].status, '实验片段')
  assert.equal(view.legend[2].status, '暂无轨迹')
  assert.equal(view.fitPoints.length, 2)
  assert.match(view.notice, /不是实际校车轨迹/)
})

test('single route and direction filtering do not show the other direction geometry', () => {
  const view = service.getOverlay({ selectedRouteId: 'route_1', directionId: '图示反向', showAllRoutes: false, includePreview: true })
  assert.equal(view.polylines.length, 0)
  assert.equal(view.legend.length, 1)
  assert.equal(view.legend[0].routeId, 'route_1')
  assert.equal(view.selectedTitle, '1路 · 图示反向')
  assert.match(view.coverageText, /0\/6 段/)
  assert.equal(view.missingSegments.length, 6)
  assert.equal(view.missingSegments[0], '五号门 → 圆顶')
})

test('selected route reports missing pairs without claiming a complete Tencent bus route', () => {
  const view = service.getOverlay({ selectedRouteId: 'route_1', showAllRoutes: false, includePreview: true })
  assert.equal(view.selectedTitle, '1路 · 图示正向')
  assert.match(view.coverageText, /1\/6 段/)
  assert.equal(view.missingSegments.length, 5)
  assert.ok(!view.missingSegments.includes('经管院 → 六号门'))
  assert.match(view.notice, /仅显示所选线路当前方向/)
})

test('separate preview segments remain separate instead of inventing a connecting road', () => {
  const multi = createRouteNetworkService(routeMapPresentationService, { getSegments: () => [segments[0], segments[0]] })
  const view = multi.getOverlay({ selectedRouteId: 'route_1', showAllRoutes: false, includePreview: true })
  assert.equal(view.polylines.length, 2)
  assert.ok(view.polylines.every((line) => line.points.length === 2))
  view.polylines[0].points[0].latitude = 0
  assert.equal(segments[0].points[0].latitude, 29.82)
})
