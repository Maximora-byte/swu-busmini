import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type {
  CandidateCoordinate,
  Coordinate,
  WalkingRouteResult,
} from '../miniprogram/models/index'
import { createGeocodingService } from '../miniprogram/services/map/geocoding.service'
import type { MapProvider } from '../miniprogram/services/map/map-provider'
import {
  TencentMapProvider,
  TencentMapProviderError,
  type TencentRequestClient,
} from '../miniprogram/services/map/tencent/tencent-map.provider'
import { createWalkingRouteService } from '../miniprogram/services/map/walking-route.service'
import { routeRecommendationService } from '../miniprogram/services/navigation/route-recommendation.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'

class MockMapProvider implements MapProvider {
  constructor(
    private readonly candidates: readonly CandidateCoordinate[],
  ) {}

  async geocode(): Promise<readonly CandidateCoordinate[]> {
    return this.candidates
  }

  async reverseGeocode(): Promise<string> {
    return '测试地址'
  }

  async walkingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<WalkingRouteResult> {
    return {
      distanceMeters: 100,
      durationSeconds: 80,
      polyline: [origin, destination],
    }
  }
}

const candidate: CandidateCoordinate = {
  coordinate: { latitude: 29.8, longitude: 106.4 },
  source: 'mock',
  confidence: 0.8,
  verified: false,
}

test('geocoding business service depends only on MapProvider', async () => {
  const service = createGeocodingService(new MockMapProvider([candidate]))

  const result = await service.getCandidates(' 西南大学 ')

  assert.deepEqual(result, [candidate])
  assert.equal(result[0]?.verified, false)
})

test('geocoding returns a candidate without modifying formal stop data', async () => {
  const repository = createStaticBusStopRepository([
    {
      id: 'pending_stop',
      name: '待确认站点',
      aliases: [],
      coordinate: null,
    },
  ])
  const service = createGeocodingService(new MockMapProvider([candidate]))

  await service.getCandidates('待确认站点')

  assert.equal(repository.findById('pending_stop')?.coordinate, null)
  assert.deepEqual(repository.getVerifiedStops(), [])
})

test('replacing MapProvider does not affect campus route recommendations', async () => {
  const before = routeRecommendationService.recommendRoutesForPoi('canteen_2')
  const replacement = new MockMapProvider([
    {
      ...candidate,
      coordinate: { latitude: 30, longitude: 106.5 },
      source: 'replacement',
    },
  ])

  await createGeocodingService(replacement).getCandidates('任意地点')
  const after = routeRecommendationService.recommendRoutesForPoi('canteen_2')

  assert.deepEqual(after, before)
})

test('walking route service delegates through the provider boundary', async () => {
  const provider = new MockMapProvider([candidate])
  const origin = { latitude: 29.8, longitude: 106.4 }
  const destination = { latitude: 29.81, longitude: 106.41 }

  const result = await createWalkingRouteService(provider).getWalkingRoute(
    origin,
    destination,
  )

  assert.deepEqual(result.polyline, [origin, destination])
  assert.equal(result.distanceMeters, 100)
})

test('Tencent provider maps geocoding response to an unverified candidate', async () => {
  const requests: Array<{
    url: string
    parameters: Readonly<Record<string, string | number>>
  }> = []
  const requestClient: TencentRequestClient = {
    async get(url, parameters) {
      requests.push({ url, parameters })
      return {
        status: 0,
        result: {
          location: { lat: 29.8, lng: 106.4 },
          similarity: 0.92,
        },
      }
    },
  }
  const provider = new TencentMapProvider({
    key: 'test-key',
    requestClient,
    region: '重庆市',
  })

  const result = await provider.geocode('西南大学')

  assert.deepEqual(result, [
    {
      coordinate: { latitude: 29.8, longitude: 106.4 },
      source: 'tencent',
      confidence: 0.92,
      verified: false,
    },
  ])
  assert.equal(requests[0]?.url, 'https://apis.map.qq.com/ws/geocoder/v1/')
  assert.deepEqual(requests[0]?.parameters, {
    key: 'test-key',
    address: '西南大学',
    region: '重庆市',
  })
})

test('Tencent provider reports API errors clearly', async () => {
  const requestClient: TencentRequestClient = {
    async get() {
      return { status: 120, message: 'QPS limit exceeded' }
    },
  }
  const provider = new TencentMapProvider({ key: 'test-key', requestClient })

  await assert.rejects(
    () => provider.geocode('西南大学'),
    (error: unknown) => {
      assert.ok(error instanceof TencentMapProviderError)
      assert.equal(error.code, 'API_ERROR')
      assert.equal(error.status, 120)
      assert.match(error.message, /QPS limit exceeded/)
      return true
    },
  )
})

test('Tencent provider classifies an invalid key', async () => {
  const requestClient: TencentRequestClient = {
    async get() {
      return { status: 190, message: 'invalid key' }
    },
  }
  const provider = new TencentMapProvider({ key: 'test-key', requestClient })

  await assert.rejects(
    () => provider.geocode('西南大学'),
    (error: unknown) => {
      assert.ok(error instanceof TencentMapProviderError)
      assert.equal(error.code, 'INVALID_KEY')
      assert.equal(error.status, 190)
      return true
    },
  )
})

test('Tencent provider normalizes network failures', async () => {
  const requestClient: TencentRequestClient = {
    async get() {
      throw new Error('socket details must not leak')
    },
  }
  const provider = new TencentMapProvider({ key: 'test-key', requestClient })

  await assert.rejects(
    () => provider.geocode('西南大学'),
    (error: unknown) => {
      assert.ok(error instanceof TencentMapProviderError)
      assert.equal(error.code, 'NETWORK_ERROR')
      assert.doesNotMatch(error.message, /socket details/)
      return true
    },
  )
})

test('Tencent provider returns an empty list when geocoding has no result', async () => {
  const requestClient: TencentRequestClient = {
    async get() {
      return { status: 347, message: 'no result' }
    },
  }
  const provider = new TencentMapProvider({ key: 'test-key', requestClient })

  assert.deepEqual(await provider.geocode('不存在的地点'), [])
})

test('Tencent provider supports reverse geocoding', async () => {
  const requestClient: TencentRequestClient = {
    async get(_url, parameters) {
      assert.deepEqual(parameters, {
        key: 'test-key',
        location: '29.8,106.4',
        get_poi: 0,
      })
      return {
        status: 0,
        result: { address: '重庆市北碚区测试路' },
      }
    },
  }
  const provider = new TencentMapProvider({ key: 'test-key', requestClient })

  assert.equal(
    await provider.reverseGeocode({ latitude: 29.8, longitude: 106.4 }),
    '重庆市北碚区测试路',
  )
})

test('Tencent provider normalizes walking route units and polyline', async () => {
  const requestClient: TencentRequestClient = {
    async get(url, parameters) {
      assert.equal(url, 'https://apis.map.qq.com/ws/direction/v1/walking/')
      assert.deepEqual(parameters, {
        key: 'test-key',
        from: '29.8,106.4',
        to: '29.81,106.41',
      })
      return {
        status: 0,
        result: {
          routes: [
            {
              distance: 250,
              duration: 3,
              polyline: [29.8, 106.4, 1000, 2000],
            },
          ],
        },
      }
    },
  }
  const provider = new TencentMapProvider({ key: 'test-key', requestClient })

  const result = await provider.walkingRoute(
    { latitude: 29.8, longitude: 106.4 },
    { latitude: 29.81, longitude: 106.41 },
  )

  assert.equal(result.distanceMeters, 250)
  assert.equal(result.durationSeconds, 180)
  assert.deepEqual(result.polyline[0], {
    latitude: 29.8,
    longitude: 106.4,
  })
  assert.ok(
    Math.abs((result.polyline[1]?.latitude ?? 0) - 29.801) < 1e-9,
  )
  assert.ok(
    Math.abs((result.polyline[1]?.longitude ?? 0) - 106.402) < 1e-9,
  )
})
