import { routes } from '../../data/routes'
import type { BusRoute } from '../../models/index'
import { parseRouteData } from './route-data.parser'

export interface RouteRepository {
  getAll(): readonly BusRoute[]
  findById(id: string): BusRoute | undefined
}

export function createStaticRouteRepository(data: unknown): RouteRepository {
  const routes = parseRouteData(data)
  const ids = new Set<string>()
  for (const route of routes) {
    if (ids.has(route.id)) {
      throw new Error(`routes.json 存在重复线路 id: ${route.id}`)
    }
    ids.add(route.id)
  }
  const routesById = new Map(routes.map((route) => [route.id, route]))

  return {
    getAll: () => routes,
    findById: (id) => routesById.get(id),
  }
}

export const routeRepository = createStaticRouteRepository(routes)
