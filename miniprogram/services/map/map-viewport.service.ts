import type { Coordinate } from '../../models/index'

/** 北碚城区/西大周边的产品浏览窗口，不代表行政边界或站点坐标。 */
export const BEIBEI_VIEWPORT = {
  center: { latitude: 29.821737, longitude: 106.422968 },
  southwest: { latitude: 29.75, longitude: 106.35 },
  northeast: { latitude: 29.90, longitude: 106.50 },
  scale: 13,
  minScale: 13,
  maxScale: 19,
} as const

export function getLocationViewport(coordinate: Coordinate) {
  const { southwest, northeast } = BEIBEI_VIEWPORT
  const isWithinArea = Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= southwest.latitude &&
    coordinate.latitude <= northeast.latitude &&
    coordinate.longitude >= southwest.longitude &&
    coordinate.longitude <= northeast.longitude
  return {
    isWithinArea,
    center: isWithinArea ? coordinate : BEIBEI_VIEWPORT.center,
    scale: isWithinArea ? 17 : BEIBEI_VIEWPORT.scale,
  }
}
