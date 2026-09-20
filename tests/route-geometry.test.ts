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
import { createRouteNavigationService } from '../miniprogram/services/navigation/route-navigation.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticRouteGeometryRepository } from '../miniprogram/services/repository/route-geometry.repository'
import { createStaticRouteRepository } from '../miniprogram/services/repository/route.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

class GeometryMapProvider implements MapProvider {
  drivingCalls = 0

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
    return { distanceMeters: 1, durationSeconds: 1, polyline: [origin, destination] }
  }

  async drivingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<DrivingRouteResult> {
    this.drivingCalls += 1
    return {
      distanceMeters: 100,
      durationSeconds: 60,
      polyline: [origin, destination],
    }
  }
}

const route: BusRoute = {
  id: 'route_test',
  name: '测试线路',
  serviceType: 'flexible_campus_bus',
  allowIntermediateStop: true,
  dataStatus: 'needs_review',
  directions: [
    {
      name: '正向',
      isLoop: false,
      stopIds: ['stop_a', 'stop_b', 'stop_c'],
    },
  ],
}

const stopRepository = createStaticBusStopRepository([
  {
    id: 'stop_a',
    name: 'A站',
    aliases: [],
    coordinate: { latitude: 29.8, longitude: 106.4, verified: true },
  },
  {
    id: 'stop_b',
    name: 'B站',
    aliases: [],
    coordinate: { latitude: 29.81, longitude: 106.41, verified: true },
  },
  {
    id: 'stop_c',
    name: 'C站',
    aliases: [],
    coordinate: { latitude: 29.82, longitude: 106.42, verified: true },
  },
])

test('generates and merges direction geometry without adjacent duplicates', async () => {
  const provider = new GeometryMapProvider()
  const generator = createRouteGeometryGeneratorService(
    provider,
    stopRepository,
    createRouteGeometryCache(),
    { source: 'mock_driving' },
  )

  const geometry = await generator.generateDirection(
    route,
    route.directions[0]!,
  )

  assert.equal(provider.drivingCalls, 2)
  assert.equal(geometry.dataStatus, 'needs_review')
  assert.equal(geometry.source, 'mock_driving')
  assert.deepEqual(geometry.points, [
    { latitude: 29.8, longitude: 106.4 },
    { latitude: 29.81, longitude: 106.41 },
    { latitude: 29.82, longitude: 106.42 },
  ])
})

test('uses a cached segment without calling the provider', async () => {
  const provider = new GeometryMapProvider()
  const origin = { latitude: 29.8, longitude: 106.4 }
  const destination = { latitude: 29.81, longitude: 106.41 }
  const oneSegmentRoute: BusRoute = {
    ...route,
    directions: [
      { name: '正向', isLoop: false, stopIds: ['stop_a', 'stop_b'] },
    ],
  }
  const cache = createRouteGeometryCache([
    {
      mode: 'driving',
      origin,
      destination,
      points: [origin, destination],
    },
  ])
  const generator = createRouteGeometryGeneratorService(
    provider,
    stopRepository,
    cache,
    { source: 'mock_driving' },
  )

  await generator.generateDirection(
    oneSegmentRoute,
    oneSegmentRoute.directions[0]!,
  )

  assert.equal(provider.drivingCalls, 0)
})

test('rejects route geometry with an invalid coordinate', () => {
  const routes = createStaticRouteRepository([route])

  assert.throws(
    () =>
      createStaticRouteGeometryRepository(
        [
          {
            routeId: route.id,
            directionId: '正向',
            source: 'test',
            dataStatus: 'needs_review',
            points: [
              { latitude: 29.8, longitude: 106.4 },
              { latitude: 91, longitude: 106.41 },
            ],
          },
        ],
        routes,
      ),
    /包含非法坐标/,
  )
})

test('does not expose unverified geometry to route navigation', () => {
  const routes = createStaticRouteRepository([route])
  const geometries = createStaticRouteGeometryRepository(
    [
      {
        routeId: route.id,
        directionId: '正向',
        source: 'tencent_driving',
        dataStatus: 'needs_review',
        points: [
          { latitude: 29.8, longitude: 106.4 },
          { latitude: 29.81, longitude: 106.41 },
        ],
      },
    ],
    routes,
  )
  const navigation = createRouteNavigationService(
    createRouteCatalogService(routes, stopRepository),
    geometries,
  ).getRouteNavigation(route.id)

  assert.equal(navigation.directions[0]?.geometry, undefined)
})

test('repository returns geometry by route and direction', () => {
  const routes = createStaticRouteRepository([route])
  const repository = createStaticRouteGeometryRepository(
    [
      {
        routeId: route.id,
        directionId: '正向',
        source: 'field_survey',
        dataStatus: 'verified',
        points: [
          { latitude: 29.8, longitude: 106.4 },
          { latitude: 29.81, longitude: 106.41 },
        ],
      },
    ],
    routes,
  )

  assert.equal(repository.getGeometry(route.id, '正向')?.source, 'field_survey')
  assert.equal(
    repository.getVerifiedGeometry(route.id, '正向')?.dataStatus,
    'verified',
  )
  assert.equal(repository.getGeometry(route.id, '反向'), undefined)
})
