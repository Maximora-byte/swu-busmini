import type { CampusPOI } from '../../models/index'
import { poiRepository, createStaticPoiRepository, type PoiRepository } from '../repository/poi.repository'
import { busStopRepository, type BusStopRepository } from '../repository/bus-stop.repository'
import { routeCatalogService, type RouteCatalogService } from '../route/route-catalog.service'
import { createOriginDestinationService } from './origin-destination.service'
import { createTransferRoutingService } from './transfer-routing.service'
import { findDirectedRouteLegs } from './directed-route-legs'

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
export interface TransferNavigationLeg {
  routeId: string
  routeName: string
  directionId: string
  boardingText: string
  destinationText: string
  pathText: string
}
export interface TransferNavigationPlan {
  id: string
  legs: TransferNavigationLeg[]
  transferStopName: string
  note: string
}
export interface NavigationPlanResult {
  plans: NavigationPlan[]
  transferPlans: TransferNavigationPlan[]
  message: string
}

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
  const transfers = createTransferRoutingService(placeRepository, catalog)
  function stopName(stopId: string): string {
    const stop = stops.findById(stopId)
    if (!stop) throw new Error(`线路引用了不存在的站点: ${stopId}`)
    return stop.name
  }
  return {
    getPlaces(): NavigationPlace[] {
      return places.map(({ id, name }) => ({ id, name }))
    },
    plan(originId: string | undefined, destinationId: string): NavigationPlanResult {
      const destination = placeRepository.findById(destinationId)
      if (!destination) throw new Error('请选择有效的目的地')
      const origin = originId ? placeRepository.findById(originId) : undefined
      if (originId && !origin) throw new Error('请选择有效的起点')
      if (originId === destinationId) return { plans: [], transferPlans: [], message: '起点和终点相同，请选择不同地点。' }
      if (!destination.relatedStopIds.length || (origin && !origin.relatedStopIds.length)) {
        return { plans: [], transferPlans: [], message: '所选地点与校车参考站点的关系尚未确认，暂不能推荐。' }
      }
      const matched = origin ? od.findDirectRoutes(origin.id, destination.id) : undefined
      const plans: NavigationPlan[] = []
      const referenceSegments = new Map<string, number>()
      for (const route of catalog.getRoutes()) {
        for (const direction of route.directions) {
          if (matched && !matched.some((item) => item.routeId === route.id && item.directions.includes(direction.name))) continue
          catalog.getRouteDetails(route.id, direction.name)
          let pathStopIds: string[]
          if (origin) {
            const [leg] = findDirectedRouteLegs(route, direction,
              new Set(origin.relatedStopIds), new Set(destination.relatedStopIds))
            if (!leg) continue
            pathStopIds = leg.stopIds
          } else {
            const to = direction.stopIds.findIndex((id) => destination.relatedStopIds.includes(id))
            if (to < 0) continue
            pathStopIds = direction.stopIds.slice(0, to + 1)
          }
          const id = `${route.id}:${direction.name}`
          referenceSegments.set(id, pathStopIds.length - 1)
          plans.push({
            id, routeId: route.id, routeName: route.name,
            directionId: direction.name,
            boardingText: origin ? stopName(pathStopIds[0]) : '未指定起点，请结合现场选择候车位置',
            destinationText: stopName(pathStopIds[pathStopIds.length - 1]),
            pathText: pathStopIds.map(stopName).join(' → '),
            note: route.allowIntermediateStop
              ? '支持沿途停靠，请结合现场情况确认安全上下车位置。'
              : '请结合现场站牌确认上下车位置。',
          })
        }
      }
      if (origin) {
        plans.sort((left, right) => (referenceSegments.get(left.id) ?? 0) - (referenceSegments.get(right.id) ?? 0) ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      }
      const transferPlans: TransferNavigationPlan[] = origin
        ? transfers.findOneTransferRoutes(origin.id, destination.id).map((recommendation) => ({
          id: JSON.stringify(recommendation.legs.map((leg) => [
            leg.routeId, leg.directionId, leg.originStopId, leg.destinationStopId,
          ])),
          legs: recommendation.legs.map((leg) => ({
            routeId: leg.routeId, routeName: leg.routeName, directionId: leg.directionId,
            boardingText: stopName(leg.originStopId), destinationText: stopName(leg.destinationStopId),
            pathText: leg.stopIds.map(stopName).join(' → '),
          })),
          transferStopName: stopName(recommendation.transferStopId),
          note: '一次换乘候选，仍待人工复核；共同参考站不保证同侧或可安全换乘。校园车支持沿途停靠时，请现场确认上下车及换乘位置。',
        })) : []
      return {
        plans,
        transferPlans,
        message: plans.length || transferPlans.length
          ? '按已知站序匹配，直达优先；换乘仅匹配同一参考站。实际运行待复核，不代表实时车辆、步行导航或到站时间。'
          : '未找到符合当前站序的直达或一次换乘线路。',
      }
    },
  }
}

export const navigationPlannerService = createNavigationPlannerService()
