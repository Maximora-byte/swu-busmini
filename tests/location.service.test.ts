import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  LocationServiceError,
  classifyLocationError,
  createLocationService,
  type LocationPlatformApi,
  type RawLocation,
} from '../miniprogram/services/location/location.service'

function createPlatformApi(
  permission: boolean | undefined,
  result: RawLocation,
): LocationPlatformApi {
  return {
    getLocationPermission: async () => permission,
    getLocation: async () => result,
  }
}

test('returns a precise GCJ-02 location from the platform adapter', async () => {
  const service = createLocationService(
    createPlatformApi(undefined, {
      latitude: 29.821737,
      longitude: 106.422968,
      accuracy: 18,
    }),
    { now: () => 123456 },
  )

  const location = await service.getCurrentLocation()

  assert.deepEqual(location, {
    coordinate: { latitude: 29.821737, longitude: 106.422968 },
    accuracy: 18,
    isApproximate: false,
    timestamp: 123456,
  })
})

test('keeps a low-accuracy location and marks it as approximate', async () => {
  const service = createLocationService(
    createPlatformApi(true, {
      latitude: 29.821737,
      longitude: 106.422968,
      accuracy: 160,
    }),
  )

  const location = await service.getCurrentLocation()

  assert.equal(location.isApproximate, true)
})

test('does not call location API after permission was denied', async () => {
  let locationWasCalled = false
  const platformApi: LocationPlatformApi = {
    getLocationPermission: async () => false,
    getLocation: async () => {
      locationWasCalled = true
      return { latitude: 0, longitude: 0, accuracy: 1 }
    },
  }

  const service = createLocationService(platformApi)

  await assert.rejects(service.getCurrentLocation(), (error: unknown) => {
    return (
      error instanceof LocationServiceError &&
      error.code === 'PERMISSION_DENIED'
    )
  })
  assert.equal(locationWasCalled, false)
})

test('classifies platform timeout without leaking platform error text', () => {
  const error = classifyLocationError({
    errMsg: 'getLocation:fail timeout',
  })

  assert.equal(error.code, 'TIMEOUT')
  assert.match(error.message, /超时/)
})

test('does not treat a disabled system location service as app denial', () => {
  const error = classifyLocationError({
    errMsg: 'getLocation:fail system permission denied',
  })

  assert.equal(error.code, 'LOCATION_UNAVAILABLE')
  assert.match(error.message, /系统定位服务/)
})

test('rejects coordinates outside the valid latitude range', async () => {
  const service = createLocationService(
    createPlatformApi(true, {
      latitude: 120,
      longitude: 106.422968,
      accuracy: 10,
    }),
  )

  await assert.rejects(service.getCurrentLocation(), (error: unknown) => {
    return (
      error instanceof LocationServiceError && error.code === 'INVALID_RESULT'
    )
  })
})
