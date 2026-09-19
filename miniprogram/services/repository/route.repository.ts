import routesData from '../../data/routes.json'
import type { BusDirection, BusRoute } from '../../models/index'

export interface RouteRepository {
  getAll(): readonly BusRoute[]
  findById(id: string): BusRoute | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseDirection(value: unknown, routeId: string): BusDirection {
  if (!isRecord(value)) {
    throw new Error(`线路 ${routeId} 包含无效方向`)
  }

  const { name, stopIds } = value
  if (typeof name !== 'string' || !isStringArray(stopIds) || stopIds.length < 2) {
    throw new Error(`线路 ${routeId} 的方向结构无效`)
  }

  return { name, stopIds: [...stopIds] }
}

function parseRoutes(value: unknown): readonly BusRoute[] {
  if (!Array.isArray(value)) {
    throw new Error('routes.json 根节点必须是数组')
  }

  const ids = new Set<string>()
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`routes.json 第 ${index + 1} 项不是对象`)
    }

    const { id, name, directions } = item
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      !Array.isArray(directions) ||
      directions.length === 0
    ) {
      throw new Error(`routes.json 第 ${index + 1} 项结构无效`)
    }

    if (ids.has(id)) {
      throw new Error(`routes.json 存在重复线路 id: ${id}`)
    }
    ids.add(id)

    const parsedDirections = directions.map((direction) =>
      parseDirection(direction, id),
    )
    const directionNames = new Set(parsedDirections.map(({ name }) => name))
    if (directionNames.size !== parsedDirections.length) {
      throw new Error(`线路 ${id} 存在重复方向名称`)
    }

    return { id, name, directions: parsedDirections }
  })
}

export function createStaticRouteRepository(data: unknown): RouteRepository {
  const routes = parseRoutes(data)
  const routesById = new Map(routes.map((route) => [route.id, route]))

  return {
    getAll: () => routes,
    findById: (id) => routesById.get(id),
  }
}

export const routeRepository = createStaticRouteRepository(routesData)
