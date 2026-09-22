import type { CampusPOI } from '../../models/index'
import { poiRepository, createStaticPoiRepository, type PoiRepository } from '../repository/poi.repository'
import { busStopRepository, type BusStopRepository } from '../repository/bus-stop.repository'
import { routeCatalogService, type RouteCatalogService } from '../route/route-catalog.service'
import { createOriginDestinationService } from './origin-destination.service'

export interface NavigationPlace { id: string; name: string }
export interface NavigationPlan {
  id: string
  routeId: string
  routeName: string
  directionId: string
  boardingText: string
  destinationText: string
  pathText: string
  note: string
}
export interface NavigationPlanResult { plans: NavigationPlan[]; message: string }

/** 仅组合校园地点、已知站序和 OD Service，不使用厂商公交或实时路线接口。 */
export function createNavigationPlannerService(
  catalog: RouteCatalogService = routeCatalogService,
  stops: BusStopRepository = busStopRepository,
  pois: PoiRepository = poiRepository,
) {
  const linkedStops = new Set(pois.getAll().flatMap((poi) => poi.relatedStopIds))
  const usedStops = new Set(catalog.getRoutes().flatMap((route) => route.directions.flatMap((direction) => direction.stopIds)))
  const places: CampusPOI[] = [
    ...pois.getAll().map((poi) => ({ ...poi, id: `poi:${poi.id}` })),
    ...stops.getAll().filter((stop) => usedStops.has(stop.id) && !linkedStops.has(stop.id)).map((stop): CampusPOI => ({
      id: `stop:${stop.id}`, name: stop.name, aliases: stop.aliases ?? [],
      category: 'other', relatedStopIds: [stop.id], dataStatus: 'needs_review',
    })),
  ]
  const placeRepository = createStaticPoiRepository(places)
  const od = createOriginDestinationService(placeRepository, catalog)
  return {
    getPlaces(): NavigationPlace[] {
      return places.map(({ id, name }) => ({ id, name }))
    },
    plan(originId: string | undefined, destinationId: string): NavigationPlanResult {
      const destination = placeRepository.findById(destinationId)
      if (!destination) throw new Error('请选择有效的目的地')
      const origin = originId ? placeRepository.findById(originId) : undefined
      if (originId && !origin) throw new Error('请选择有效的起点')
      if (originId === destinationId) return { plans: [], message: '起点和终点相同，请选择不同地点。' }
      if (!destination.relatedStopIds.length || (origin && !origin.relatedStopIds.length)) {
        return { plans: [], message: '所选地点与校车参考站点的关系尚未确认，暂不能推荐。' }
      }
      const matched = origin ? od.findDirectRoutes(origin.id, destination.id) : undefined
      const plans: NavigationPlan[] = []
      for (const route of catalog.getRoutes()) {
        for (const direction of route.directions) {
          if (matched && !matched.some((item) => item.routeId === route.id && item.directions.includes(direction.name))) continue
          const details = catalog.getRouteDetails(route.id, direction.name)
          let from = -1
          let to = -1
          if (origin) {
            for (let i = 0; i < direction.stopIds.length && to < 0; i++) {
              if (!origin.relatedStopIds.includes(direction.stopIds[i])) continue
              const end = direction.stopIds.findIndex((id, index) => index > i && destination.relatedStopIds.includes(id))
              if (end > i) { from = i; to = end }
            }
          } else {
            to = direction.stopIds.findIndex((id) => destination.relatedStopIds.includes(id))
          }
          if (to < 0) continue
          plans.push({
            id: `${route.id}:${direction.name}`, routeId: route.id, routeName: route.name,
            directionId: direction.name,
            boardingText: from >= 0 ? details.stops[from].name : '未指定起点，请结合现场选择候车位置',
            destinationText: details.stops[to].name,
            pathText: details.stops.slice(from >= 0 ? from : 0, to + 1).map((stop) => stop.name).join(' → '),
            note: route.allowIntermediateStop
              ? '支持沿途停靠，请结合现场情况确认安全上下车位置。'
              : '请结合现场站牌确认上下车位置。',
          })
        }
      }
      return {
        plans,
        message: plans.length
          ? '按已知站序匹配，实际运行待复核；不代表实时车辆、步行导航或到站时间。'
          : '未找到符合当前站序的直达线路，暂不提供换乘方案。',
      }
    },
  }
}

export const navigationPlannerService = createNavigationPlannerService()
