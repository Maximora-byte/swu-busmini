import type { Coordinate } from '../models/index'

const EARTH_MEAN_RADIUS_METERS = 6_371_008.8
const DEGREES_TO_RADIANS = Math.PI / 180

function assertValidCoordinate(coordinate: Coordinate): void {
  if (
    !Number.isFinite(coordinate.latitude) ||
    !Number.isFinite(coordinate.longitude) ||
    coordinate.latitude < -90 ||
    coordinate.latitude > 90 ||
    coordinate.longitude < -180 ||
    coordinate.longitude > 180
  ) {
    throw new RangeError('Coordinate latitude or longitude is invalid')
  }
}

/** 使用 Haversine 公式计算两个 GCJ-02 坐标间的球面距离，单位为米。 */
export function distanceBetween(a: Coordinate, b: Coordinate): number {
  assertValidCoordinate(a)
  assertValidCoordinate(b)

  const latitudeA = a.latitude * DEGREES_TO_RADIANS
  const latitudeB = b.latitude * DEGREES_TO_RADIANS
  const latitudeDelta = (b.latitude - a.latitude) * DEGREES_TO_RADIANS
  const longitudeDelta = (b.longitude - a.longitude) * DEGREES_TO_RADIANS

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) ** 2
  const centralAngle =
    2 *
    Math.atan2(
      Math.sqrt(Math.min(1, Math.max(0, haversine))),
      Math.sqrt(Math.max(0, 1 - haversine)),
    )

  return EARTH_MEAN_RADIUS_METERS * centralAngle
}
