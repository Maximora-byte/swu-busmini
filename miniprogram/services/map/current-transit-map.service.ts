import type { TransitDataset } from '../../models/current-transit'
import type { Coordinate } from '../../models/index'
import { isAutomaticBoardingVisit } from '../navigation/transit-visit-policy'

export interface CurrentRouteStopView {
  key: string; stopId: string; visitIndex: number; name: string; coordinate: Coordinate; canBoard: boolean; reviewText: string
}
export interface CurrentMapPresentation {
  routeId: string; name: string; color: string; summary: string; warnings: string[]; stops: CurrentRouteStopView[]
  legend: { routeId: string; name: string; color: string }[]
  polylines: { points: Coordinate[]; color: string; width: number }[]
  fitPoints: Coordinate[]; stopIds: string[]; eligibleStopIds: string[]
}
export function getCurrentMapPresentation(dataset: TransitDataset, routeId: string, options: { network?: boolean; reverse?: boolean } = {}): CurrentMapPresentation {
  const route = dataset.routes.find(({ id }) => id === routeId)
  if (!route) throw new Error('当前公布资料中没有这条线路。')
  const stopsById = new Map(dataset.stops.map((stop) => [stop.id, stop]))
  const stops = route.visits.map((visit, visitIndex) => {
    const stop = stopsById.get(visit.stopId)
    if (!stop) throw new Error('线路参考点缺失，请重新加载资料。')
    const canBoard = isAutomaticBoardingVisit(visit)
    return { key: `${route.id}:${visitIndex}`, stopId: stop.id, visitIndex, name: stop.name,
      coordinate: { ...stop.coordinate }, canBoard, reviewText: canBoard ? '' : '位置待核对，暂不作为本线路乘降点' }
  })
  if (options.reverse) stops.reverse()
  const routes = options.network ? dataset.routes : [route]
  const polylines = routes.map((item) => ({
    points: item.points.map((point) => ({ ...point })), color: item.color,
    width: item.id === route.id ? 7 : 4,
  }))
  return {
    routeId: route.id, name: route.name, color: route.color,
    summary: stops.length ? `${stops[0].name} → ${stops[stops.length - 1].name}` : '暂无参考站序',
    warnings: [...route.warnings], stops,
    legend: routes.map(({ id, name, color }) => ({ routeId: id, name, color })),
    polylines, fitPoints: polylines.flatMap(({ points }) => points.map((point) => ({ ...point }))),
    stopIds: [...new Set(routes.flatMap((item) => item.visits.map(({ stopId }) => stopId)))],
    eligibleStopIds: [...new Set(routes.flatMap((item) => item.visits.filter(isAutomaticBoardingVisit).map(({ stopId }) => stopId)))],
  }
}
