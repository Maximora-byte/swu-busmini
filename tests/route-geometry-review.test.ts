import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type {
  BusRoute,
  CandidateCoordinate,
  Coordinate,
  DrivingRouteResult,
  WalkingRouteResult,
} from '../miniprogram/models/index'
import type { MapProvider } from '../miniprogram/services/map/map-provider'
import { createRouteGeometryCache } from '../miniprogram/services/map/route-geometry-cache'
import { createRouteGeometryGeneratorService } from '../miniprogram/services/map/route-geometry-generator.service'
import { createRouteGeometryReviewService } from '../miniprogram/services/map/route-geometry-review.service'
import { createRouteNavigationService } from '../miniprogram/services/navigation/route-navigation.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticRouteGeometryRepository } from '../miniprogram/services/repository/route-geometry.repository'
import { createStaticRouteRepository } from '../miniprogram/services/repository/route.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

const route: BusRoute = {
  id: 'route_1',
  name: '1路',
  serviceType: 'flexible_campus_bus',
  allowIntermediateStop: true,
  dataStatus: 'needs_review',
  directions: [
    {
      name: '图示正向',
      isLoop: false,
      stopIds: ['stop_a', 'stop_b'],
    },
  ],
}

const routeRepository = createStaticRouteRepository([route])
const pendingStops = createStaticBusStopRepository([
  { id: 'stop_a', name: 'A站', aliases: [], coordinate: null },
  { id: 'stop_b', name: 'B站', aliases: [], coordinate: null },
])
const points = [
  { latitude: 29.8, longitude: 106.4 },
  { latitude: 29.81, longitude: 106.41 },
]

function createNavigation(data: unknown) {
  const geometries = createStaticRouteGeometryRepository(data, routeRepository)
  return createRouteNavigationService(
    createRouteCatalogService(routeRepository, pendingStops),
    geometries,
  )
}

test('verified geometry enters the production navigation view', () => {
  const navigation = createNavigation([
    {
      routeId: route.id,
      directionId: '图示正向',
      source: 'field_review',
      dataStatus: 'verified',
      points,
    },
  ]).getRouteNavigation(route.id, '图示正向')

  assert.deepEqual(navigation.geometry?.points, points)
})

test('needs_review geometry stays hidden in production but supports preview', () => {
  const navigationService = createNavigation([
    {
      routeId: route.id,
      directionId: '图示正向',
      source: 'tencent_driving',
      dataStatus: 'needs_review',
      points,
    },
  ])

  assert.equal(
    navigationService.getRouteNavigation(route.id, '图示正向').geometry,
    undefined,
  )
  assert.equal(
    navigationService.getRouteNavigation(route.id, '图示正向', {
      previewUnverifiedGeometry: true,
    }).geometry?.dataStatus,
    'needs_review',
  )
})

class CountingProvider implements MapProvider {
  routeCalls = 0

  async geocode(): Promise<readonly CandidateCoordinate[]> {
    return []
  }

  async reverseGeocode(): Promise<string> {
    return '测试地址'
  }

  async walkingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<WalkingRouteResult> {
    this.routeCalls += 1
    return { distanceMeters: 1, durationSeconds: 1, polyline: [origin, destination] }
  }

  async drivingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<DrivingRouteResult> {
    this.routeCalls += 1
    return { distanceMeters: 1, durationSeconds: 1, polyline: [origin, destination] }
  }
}

test('missing verified coordinates stop generation before provider calls', async () => {
  const provider = new CountingProvider()
  const generator = createRouteGeometryGeneratorService(
    provider,
    pendingStops,
    createRouteGeometryCache(),
    { source: 'tencent_driving' },
  )

  await assert.rejects(
    () => generator.generateDirection(route, route.directions[0]!),
    /missing|尚无已验证坐标/,
  )
  assert.equal(provider.routeCalls, 0)
})

test('review approval verifies and rejection removes a candidate', () => {
  const repository = createStaticRouteGeometryRepository(
    [
      {
        routeId: route.id,
        directionId: '图示正向',
        source: 'tencent_driving',
        dataStatus: 'generated',
        points,
      },
    ],
    routeRepository,
  )
  const review = createRouteGeometryReviewService(repository)
  const pending = review.getForReview(route.id, '图示正向')

  assert.equal(pending.length, 1)
  assert.equal(
    review.approve(repository.getAll(), route.id, '图示正向')[0]
      ?.dataStatus,
    'verified',
  )
  assert.deepEqual(
    review.reject(repository.getAll(), route.id, '图示正向'),
    [],
  )
})
