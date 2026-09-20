import geometryData from '../../data/route-geometries.json'
import type { RouteGeometry } from '../../models/index'
import { routeRepository, type RouteRepository } from './route.repository'
import { validateRouteGeometryData } from '../validation/route-geometry-validator'

export interface RouteGeometryRepository {
  getAll(): readonly RouteGeometry[]
  getGeometry(
    routeId: string,
    directionId: string,
  ): RouteGeometry | undefined
  getVerifiedGeometry(
    routeId: string,
    directionId: string,
  ): RouteGeometry | undefined
}

function cloneGeometry(geometry: RouteGeometry): RouteGeometry {
  return {
    ...geometry,
    points: geometry.points.map((point) => ({ ...point })),
  }
}

export function createStaticRouteGeometryRepository(
  data: unknown,
  routes: RouteRepository,
): RouteGeometryRepository {
  const result = validateRouteGeometryData(data, routes.getAll())
  if (!result.valid) {
    throw new Error(result.issues[0]?.message ?? '线路轨迹数据无效')
  }
  const geometries = result.geometries.map(cloneGeometry)
  const geometriesByKey = new Map(
    geometries.map((geometry) => [
      `${geometry.routeId}\u0000${geometry.directionId}`,
      geometry,
    ]),
  )

  function getGeometry(
    routeId: string,
    directionId: string,
  ): RouteGeometry | undefined {
    const geometry = geometriesByKey.get(`${routeId}\u0000${directionId}`)
    return geometry ? cloneGeometry(geometry) : undefined
  }

  return {
    getAll: () => geometries.map(cloneGeometry),
    getGeometry,
    getVerifiedGeometry(routeId, directionId) {
      const geometry = getGeometry(routeId, directionId)
      return geometry?.dataStatus === 'verified' ? geometry : undefined
    },
  }
}

export const routeGeometryRepository = createStaticRouteGeometryRepository(
  geometryData,
  routeRepository,
)
