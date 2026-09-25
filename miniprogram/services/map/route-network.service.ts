import type { Coordinate } from '../../models/index'
import { routePreviewRepository } from '../repository/route-preview.repository'
import { routeMapPresentationService, type RouteMapPresentationService } from './route-map-presentation.service'
import type { RouteMapPolyline } from './route-polyline.service'
import type { RoutePreviewSegment } from './route-preview.types'

interface PreviewSource {
  getSegments(routeId: string, directionId?: string): readonly RoutePreviewSegment[]
}

export interface RouteNetworkLegend {
  routeId: string
  name: string
  color: string
  selected: boolean
  segmentCount: number
  status: string
}

export interface RouteNetworkView {
  polylines: RouteMapPolyline[]
  legend: RouteNetworkLegend[]
  fitPoints: Coordinate[]
  notice: string
  selectedTitle: string
  coverageText: string
  missingSegments: string[]
}

/** 路网叠加仅消费本地仓库；候选折线是显式开启的实验图层，不进入正式轨迹。 */
export function createRouteNetworkService(
  presentation: RouteMapPresentationService = routeMapPresentationService,
  previews: PreviewSource = routePreviewRepository,
) {
  return {
    getOverlay(options: {
      selectedRouteId: string
      directionId?: string
      showAllRoutes: boolean
      includePreview: boolean
    }): RouteNetworkView {
      const routes = presentation.getRouteOptions(options.selectedRouteId)
        .filter((route) => options.showAllRoutes || route.selected)
      const polylines: RouteMapPolyline[] = []
      const legend: RouteNetworkLegend[] = []
      let selectedTitle = ''
      let coverageText = ''
      let missingSegments: string[] = []
      // 选中线路最后绘制且加粗；不偏移任何真实坐标。
      const drawingOrder = [...routes].sort((a, b) => Number(a.selected) - Number(b.selected))
      for (const route of drawingOrder) {
        const view = presentation.getRoutePresentation(route.id, route.selected ? options.directionId : undefined)
        const directionId = view.routeDirections.find((direction) => direction.selected)?.id
        const verified = view.routePolylines
        const pending = options.includePreview && verified.length === 0 && directionId
          ? previews.getSegments(route.id, directionId) : []
        if (route.selected) {
          selectedTitle = `${route.name} · ${directionId ?? '方向待确认'}`
          const expected = view.routeStops.slice(1).map((stop, index) => ({
            from: view.routeStops[index], to: stop,
          }))
          missingSegments = verified.length > 0 ? [] : expected.filter(({ from, to }) =>
            !pending.some((segment) => segment.fromStopId === from.id && segment.toStopId === to.id),
          ).map(({ from, to }) => `${from.name} → ${to.name}`)
          coverageText = verified.length > 0 ? '已显示人工审核轨迹'
            : options.includePreview
              ? `腾讯参考路线 ${expected.length - missingSegments.length}/${expected.length} 段 · 待核对${missingSegments.length ? '，缺失段留空' : ''}`
              : '点击线路编号即可查看腾讯参考路线（待核对）'
        }
        const lines: RouteMapPolyline[] = verified.length > 0
          ? verified.map((line) => ({ ...line, width: route.selected ? 8 : 4 }))
          : pending.map((segment) => ({
              points: segment.points.map((point) => ({ ...point })),
              color: route.color, width: route.selected ? 7 : 3, dottedLine: true,
            }))
        polylines.push(...lines)
        legend.push({
          routeId: route.id, name: route.name, color: route.color, selected: route.selected,
          segmentCount: lines.length,
          status: verified.length > 0 ? '已审核' : lines.length > 0 ? '实验片段' : '暂无轨迹',
        })
      }
      const points = polylines.flatMap((line) => line.points)
      const fitPoints: Coordinate[] = points.length === 0 ? [] : [
        { latitude: Math.min(...points.map((p) => p.latitude)), longitude: Math.min(...points.map((p) => p.longitude)) },
        { latitude: Math.max(...points.map((p) => p.latitude)), longitude: Math.max(...points.map((p) => p.longitude)) },
      ]
      return {
        polylines,
        legend: routes.map((route) => legend.find((item) => item.routeId === route.id)!),
        fitPoints,
        selectedTitle,
        coverageText,
        missingSegments,
        notice: options.includePreview
          ? `虚线为腾讯驾车参考片段，坐标与走向未审核，不是实际校车轨迹。${options.showAllRoutes ? '总览显示各线首方向；点击编号只看该线。' : '仅显示所选线路当前方向，不代表实时导航。'}`
          : polylines.length > 0
            ? '实线为已审核轨迹，颜色对应线路；重叠路段可单独选线查看。'
            : '暂无已审核轨迹。点击线路编号可查看腾讯参考路线，勿据此判断候车位置。',
      }
    },
  }
}

export const routeNetworkService = createRouteNetworkService()
