import type { Coordinate } from './index'

/** 运营方公布的物理站点；同名异点、异名同点均保持不同身份。 */
export interface TransitStop {
  id: string
  name: string
  coordinate: Coordinate
}

/** 在一条公布轨迹上的一次站点观察，按沿线投影里程排序。 */
export interface TransitVisit {
  stopId: string
  sourceIndex: number
  segmentIndex: number
  ratio: number
  mileageMeters: number
  offsetMeters: number
}

export interface TransitRoute {
  id: string
  name: string
  color: string
  /** 原样保留发布点序，不补闭合点或猜测道路。 */
  points: Coordinate[]
  visits: TransitVisit[]
  warnings: string[]
}

export interface TransitDataset {
  id: string
  source: string
  observedAt: string
  coordinateSystem: 'GCJ-02'
  quality: 'operator_published'
  stops: TransitStop[]
  routes: TransitRoute[]
}
