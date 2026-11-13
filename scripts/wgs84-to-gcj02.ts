/**
 * Approximate forward conversion for build-time OSM POI import only.
 * Adapted from googollee/eviltransform's JavaScript wgs2gcj path:
 * https://github.com/googollee/eviltransform/blob/03ba58d92dfda57f8a1635f3805483c8fc10bd77/javascript/transform.js
 * Copyright (c) 2015 Googol Lee and contributors. Full copyright, conditions,
 * and disclaimer: ../miniprogram/legal/eviltransform-LICENSE.txt.
 *
 * Keep the original WGS84 coordinate and provenance alongside imported data.
 * This approximation has no field-verified accuracy guarantee. The upstream
 * applicability rectangle is a numerical guard, not a geographic boundary.
 */
export function wgs84ToGcj02(
  point: { latitude: number; longitude: number },
): { latitude: number; longitude: number } {
  const { latitude, longitude } = point
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) {
    throw new RangeError('Expected finite latitude in [-90, 90] and longitude in [-180, 180]')
  }
  if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) {
    return { latitude, longitude }
  }

  const x = longitude - 105
  const y = latitude - 35
  const xy = x * y
  const absX = Math.sqrt(Math.abs(x))
  const xPi = x * Math.PI
  const yPi = y * Math.PI
  const shared = 20 * Math.sin(6 * xPi) + 20 * Math.sin(2 * xPi)
  let deltaLatitude = shared
  let deltaLongitude = shared
  deltaLatitude += 20 * Math.sin(yPi) + 40 * Math.sin(yPi / 3)
  deltaLongitude += 20 * Math.sin(xPi) + 40 * Math.sin(xPi / 3)
  deltaLatitude += 160 * Math.sin(yPi / 12) + 320 * Math.sin(yPi / 30)
  deltaLongitude += 150 * Math.sin(xPi / 12) + 300 * Math.sin(xPi / 30)
  deltaLatitude *= 2 / 3
  deltaLongitude *= 2 / 3
  deltaLatitude += -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * xy + 0.2 * absX
  deltaLongitude += 300 + x + 2 * y + 0.1 * x * x + 0.1 * xy + 0.1 * absX

  const earthRadius = 6378137
  const eccentricitySquared = 0.00669342162296594323
  const radians = latitude / 180 * Math.PI
  const sinLatitude = Math.sin(radians)
  const magic = 1 - eccentricitySquared * sinLatitude * sinLatitude
  const sqrtMagic = Math.sqrt(magic)
  deltaLatitude = deltaLatitude * 180 /
    (earthRadius * (1 - eccentricitySquared) / (magic * sqrtMagic) * Math.PI)
  deltaLongitude = deltaLongitude * 180 /
    (earthRadius / sqrtMagic * Math.cos(radians) * Math.PI)
  return { latitude: latitude + deltaLatitude, longitude: longitude + deltaLongitude }
}
