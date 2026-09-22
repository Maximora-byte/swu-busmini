import type { Coordinate, RouteGeometry } from '../../models/index'

export interface RouteMapPolyline {
  points: Coordinate[]
  color: string
  width: number
  /** 仅实验预览使用虚线，避免与已审核真实轨迹混淆。 */
  dottedLine?: boolean
}

export interface RoutePolylineStyle {
  color?: string
  width?: number
}

export interface RoutePolylineService {
  toMapPolyline(
    geometry: RouteGeometry,
    style?: RoutePolylineStyle,
  ): RouteMapPolyline
}

const DEFAULT_COLOR = '#126b47'
const DEFAULT_WIDTH = 6

/** 只负责适配微信 map polyline 结构，不补点或转换坐标系。 */
export function createRoutePolylineService(): RoutePolylineService {
  return {
    toMapPolyline(geometry, style = {}) {
      return {
        points: geometry.points.map((point) => ({ ...point })),
        color: style.color ?? DEFAULT_COLOR,
        width: style.width ?? DEFAULT_WIDTH,
      }
    },
  }
}

export const routePolylineService = createRoutePolylineService()
