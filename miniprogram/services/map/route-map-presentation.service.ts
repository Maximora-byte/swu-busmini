import type { RouteNavigationDirection } from '../../models/index'
import {
  routeNavigationService,
  type RouteNavigationService,
} from '../navigation/route-navigation.service'
import {
  routePolylineService,
  type RouteMapPolyline,
} from './route-polyline.service'

export interface RouteOptionView {
  id: string
  name: string
  selected: boolean
  color: string
  textColor: string
}

export interface RouteDirectionView {
  id: string
  name: string
  summary: string
  selected: boolean
}

export interface RouteStopView {
  key: string
  id: string
  name: string
  hasVerifiedCoordinate: boolean
  isLast: boolean
  positionLabel: string
}

export interface BusStopMarker {
  id: number
  latitude: number
  longitude: number
  title: string
  iconPath: string
  width: number
  height: number
  label: {
    content: string
    color: string
    fontSize: number
    borderRadius: number
    bgColor: string
    padding: number
  }
}

export interface RouteMapPresentation {
  routeName: string
  selectedRouteId: string
  routeColor: string
  routeTextColor: string
  routeSummary: string
  routeKindText: string
  routeDirections: RouteDirectionView[]
  routeStops: RouteStopView[]
  busStopMarkers: BusStopMarker[]
  routePolylines: RouteMapPolyline[]
  routeCoordinateStatusText: string
  routeGeometryStatusText: string
  routeServiceNote: string
  routeDataErrorText: ''
}

export interface RouteMapPresentationService {
  getRouteOptions(selectedRouteId: string): RouteOptionView[]
  getRoutePresentation(
    routeId: string,
    directionId?: string,
  ): RouteMapPresentation
}

// 参考 2025 校园地图线路表的识别色；仅用于展示，不表示数据已复核。
const ROUTE_COLORS: Readonly<Record<string, string>> = {
  route_1: '#2e774c',
  route_2: '#f0cf4a',
  route_3: '#cd4386',
  route_4: '#159fbb',
  route_5: '#344a91',
  route_6: '#dc7038',
  route_7: '#9b3b86',
  route_8: '#339163',
  route_9: '#ae3f39',
}

function routeStyle(routeId: string): { color: string; textColor: string } {
  return {
    color: ROUTE_COLORS[routeId] ?? '#2e774c',
    textColor: routeId === 'route_2' ? '#433600' : '#ffffff',
  }
}

function directionSummary(direction: RouteNavigationDirection): string {
  const names = direction.knownStops.map((stop) => stop.name)
  if (names.length === 0) return '已知参考站点待补充'
  if (names.length === 1) return names[0]
  if (!direction.isLoop) return `${names[0]} → ${names[names.length - 1]}`
  // 环线不能只显示“竹园 → 竹园”；前 3 站也能区分 6/9 路的方向。
  return names.length <= 4
    ? names.join(' → ')
    : [...names.slice(0, 3), '…', names[names.length - 1]].join(' → ')
}

/** 组合展示状态，页面只负责选择线路/方向和渲染。 */
export function createRouteMapPresentationService(
  navigation: RouteNavigationService = routeNavigationService,
): RouteMapPresentationService {
  return {
    getRouteOptions(selectedRouteId) {
      return navigation.getRoutes().map((route) => ({
        id: route.routeId,
        name: route.routeName,
        selected: route.routeId === selectedRouteId,
        ...routeStyle(route.routeId),
      }))
    },

    getRoutePresentation(routeId, directionId) {
      const route = navigation.getRoute(routeId)
      const view = navigation.getRouteNavigation(routeId, directionId)
      const direction = route.directions.find(
        (item) => item.directionId === view.directionId,
      )
      if (!direction) {
        throw new Error(`线路 ${routeId} 不存在方向: ${view.directionId}`)
      }

      const style = routeStyle(routeId)
      const seenStopIds = new Set<string>()
      const routeStops = view.stops.map((stop, index): RouteStopView => {
        const isLast = index === view.stops.length - 1
        const returnsToStart =
          direction.isLoop && isLast && stop.stopId === view.stops[0]?.stopId
        const positionLabel =
          index === 0
            ? '起点'
            : returnsToStart
              ? '返回起点'
              : isLast
                ? '终点'
                : seenStopIds.has(stop.stopId)
                  ? '再次经过'
                  : ''
        seenStopIds.add(stop.stopId)
        return {
          key: `${stop.stopId}-${index}`,
          id: stop.stopId,
          name: stop.stopName,
          hasVerifiedCoordinate: stop.coordinate !== undefined,
          isLast,
          positionLabel,
        }
      })

      // 导航服务只提供 verified 坐标。站序保留重复经过，地图按站点去重。
      const uniqueStops = [...new Map(view.stops.map((stop) => [stop.stopId, stop])).values()]
      const busStopMarkers: BusStopMarker[] = []
      uniqueStops.forEach((stop, index) => {
        if (!stop.coordinate) return
        busStopMarkers.push({
          id: 1000 + index,
          ...stop.coordinate,
          title: stop.stopName,
          iconPath: '/assets/icons/bus-stop-marker.svg',
          width: 30,
          height: 36,
          label: {
            content: stop.stopName,
            color: '#263d32',
            fontSize: 12,
            borderRadius: 4,
            bgColor: '#ffffff',
            padding: 4,
          },
        })
      })
      const missingCoordinates = uniqueStops.length - busStopMarkers.length
      const geometry = view.geometry?.dataStatus === 'verified' ? view.geometry : undefined

      return {
        routeName: view.routeName,
        selectedRouteId: view.routeId,
        routeColor: style.color,
        routeTextColor: style.textColor,
        routeSummary: directionSummary(direction),
        routeKindText: direction.isLoop
          ? '环线'
          : route.directions.length > 1
            ? '往返线路'
            : '参考线路',
        routeDirections: route.directions.map((item) => ({
          id: item.directionId,
          name: item.name,
          summary: directionSummary(item),
          selected: item.directionId === view.directionId,
        })),
        routeStops,
        busStopMarkers,
        routePolylines: geometry
          ? [routePolylineService.toMapPolyline(geometry, { color: style.color })]
          : [],
        routeCoordinateStatusText: uniqueStops.length === 0
          ? '已知参考站点待补充'
          : missingCoordinates > 0
            ? `${missingCoordinates} 个参考站点坐标待现场校准，暂不在地图标注`
            : '参考站点坐标已校准，可在地图查看',
        routeGeometryStatusText: geometry
          ? '已显示人工确认的线路轨迹'
          : '线路轨迹待人工确认，先查看已知站序',
        routeServiceNote: view.note ?? '',
        routeDataErrorText: '',
      }
    },
  }
}

export const routeMapPresentationService = createRouteMapPresentationService()
export default routeMapPresentationService
