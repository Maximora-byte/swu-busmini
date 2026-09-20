import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type {
  BusStop,
  CoordinateReview,
  CoordinateReviewStatus,
} from '../miniprogram/models/index'
import { createCoordinateVerificationService } from '../miniprogram/services/location/coordinate-verification.service'
import { createNearestStopService } from '../miniprogram/services/location/nearest-stop.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticCoordinateReviewRepository } from '../miniprogram/services/repository/coordinate-review.repository'
import { createReviewedBusStopRepository } from '../miniprogram/services/repository/reviewed-bus-stop.repository'
import { createStaticRouteRepository } from '../miniprogram/services/repository/route.repository'
import { createRouteCatalogService } from '../miniprogram/services/route/route-catalog.service'

const stops: readonly BusStop[] = [
  {
    id: 'stop_a',
    name: 'A站',
    aliases: [],
    coordinate: null,
  },
]

function createReview(status: CoordinateReviewStatus): CoordinateReview {
  return {
    targetId: 'stop_a',
    candidateCoordinate: {
      coordinate: { latitude: 29.8, longitude: 106.4 },
      source: 'tencent',
      confidence: 0.9,
      verified: false,
    },
    source: 'tencent',
    status,
    reviewedAt:
      status === 'pending_review' ? null : '2026-09-20T12:00:00+08:00',
  }
}

function createReviewedStops(status: CoordinateReviewStatus) {
  const reviews = createStaticCoordinateReviewRepository([
    createReview(status),
  ])
  return createReviewedBusStopRepository(
    createStaticBusStopRepository(stops),
    createCoordinateVerificationService(reviews),
  )
}

test('a pending coordinate cannot enter the map marker pipeline', () => {
  const reviewedStops = createReviewedStops('pending_review')
  const routes = createStaticRouteRepository([
    {
      id: 'route_test',
      name: '测试线路',
      serviceType: 'fixed_stop',
      allowIntermediateStop: false,
      dataStatus: 'needs_review',
      directions: [
        {
          name: '正向',
          isLoop: false,
          stopIds: ['stop_a'],
        },
      ],
    },
  ])

  const details = createRouteCatalogService(
    routes,
    reviewedStops,
  ).getRouteDetails('route_test')

  assert.deepEqual(details.mappableStops, [])
  assert.equal(details.pendingCoordinateCount, 1)
})

test('a manually verified coordinate can enter nearest-stop results', () => {
  const reviewedStops = createReviewedStops('verified')

  const results = createNearestStopService(reviewedStops).getNearestStops({
    latitude: 29.8001,
    longitude: 106.4,
  })

  assert.equal(results.length, 1)
  assert.equal(results[0]?.stopId, 'stop_a')
  assert.deepEqual(results[0]?.coordinate, {
    latitude: 29.8,
    longitude: 106.4,
  })
})

test('a rejected coordinate is filtered from spatial services', () => {
  const reviewedStops = createReviewedStops('rejected')

  assert.deepEqual(reviewedStops.getVerifiedStops(), [])
  assert.deepEqual(
    createNearestStopService(reviewedStops).getNearestStops({
      latitude: 29.8,
      longitude: 106.4,
    }),
    [],
  )
})
