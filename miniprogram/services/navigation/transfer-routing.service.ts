import type { DataStatus } from '../../models/index'
import { poiRepository, type PoiRepository } from '../repository/poi.repository'
import { routeCatalogService, type RouteCatalogService } from '../route/route-catalog.service'
import { findDirectedRouteLegs, type DirectedRouteLeg } from './directed-route-legs'

export type TransferRouteLeg = DirectedRouteLeg

/** 只确认已知站序上的连通性，不承诺同侧候车、实际停靠或换乘安全。 */
export interface TransferRouteRecommendation {
  originPoiId: string
  destinationPoiId: string
  transferStopId: string
  legs: [TransferRouteLeg, TransferRouteLeg]
  dataStatus: DataStatus
}

export interface TransferRoutingService {
  findOneTransferRoutes(originPoiId: string, destinationPoiId: string): TransferRouteRecommendation[]
}

const MAX_TRANSFER_RESULTS = 6

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function recommendationKey(recommendation: TransferRouteRecommendation): string {
  return JSON.stringify(recommendation.legs.map((leg) => [
    leg.routeId, leg.directionId, leg.originStopId, leg.destinationStopId,
  ]))
}

export function createTransferRoutingService(
  pois: PoiRepository = poiRepository,
  catalog: RouteCatalogService = routeCatalogService,
): TransferRoutingService {
  return {
    findOneTransferRoutes(originPoiId, destinationPoiId) {
      const origin = pois.findById(originPoiId)
      if (!origin) throw new Error(`未找到起点校园地点: ${originPoiId}`)
      const destination = pois.findById(destinationPoiId)
      if (!destination) throw new Error(`未找到终点校园地点: ${destinationPoiId}`)
      if (origin.id === destination.id || !origin.relatedStopIds.length || !destination.relatedStopIds.length) return []

      const directions = catalog.getRoutes().flatMap((route) => route.directions.map((direction) => {
        // 使用 Catalog 的既有完整性验证，不能默默让未知 stopId 参与匹配。
        catalog.getRouteDetails(route.id, direction.name)
        return { route, direction }
      }))
      const firstLegs = directions.flatMap(({ route, direction }) =>
        findDirectedRouteLegs(route, direction, new Set(origin.relatedStopIds)))
      const transferStopIds = new Set(firstLegs.map((leg) => leg.destinationStopId))
      const secondLegs = directions.flatMap(({ route, direction }) =>
        findDirectedRouteLegs(route, direction, transferStopIds, new Set(destination.relatedStopIds)))
      const directLegKeys = new Set(directions.flatMap(({ route, direction }) =>
        findDirectedRouteLegs(route, direction, new Set(origin.relatedStopIds), new Set(destination.relatedStopIds))
          .map((leg) => JSON.stringify([leg.routeId, leg.directionId, leg.originStopId, leg.destinationStopId]))))
      const secondLegsByStart = new Map<string, TransferRouteLeg[]>()
      for (const leg of secondLegs) {
        const legs = secondLegsByStart.get(leg.originStopId) ?? []
        legs.push(leg)
        secondLegsByStart.set(leg.originStopId, legs)
      }

      const recommendations = new Map<string, TransferRouteRecommendation>()
      for (const first of firstLegs) {
        for (const second of secondLegsByStart.get(first.destinationStopId) ?? []) {
          if (first.routeId === second.routeId || first.originStopId === second.destinationStopId) continue
          // 若任一段的同线路同方向本可直达，此次换乘没有必要，不重复推荐。
          if ([first, second].some((leg) => directLegKeys.has(JSON.stringify([
            leg.routeId, leg.directionId, first.originStopId, second.destinationStopId,
          ])))) continue
          const recommendation: TransferRouteRecommendation = {
            originPoiId, destinationPoiId, transferStopId: first.destinationStopId,
            legs: [first, second], dataStatus: 'needs_review',
          }
          recommendations.set(recommendationKey(recommendation), recommendation)
        }
      }

      // 仅按参考站序段数和稳定标识排序，不代表更快、更近或实际最优。
      return [...recommendations.values()].sort((left, right) => {
        const leftSegments = left.legs.reduce((sum, leg) => sum + leg.stopIds.length - 1, 0)
        const rightSegments = right.legs.reduce((sum, leg) => sum + leg.stopIds.length - 1, 0)
        return leftSegments - rightSegments || compareText(recommendationKey(left), recommendationKey(right))
      }).slice(0, MAX_TRANSFER_RESULTS)
    },
  }
}

export const transferRoutingService = createTransferRoutingService()
