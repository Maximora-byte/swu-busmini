/** 微信地图使用的 GCJ-02 坐标。 */
export interface Coordinate {
  latitude: number
  longitude: number
}

/** 外部地图服务返回、尚待人工复核的坐标候选。 */
export interface CandidateCoordinate {
  coordinate: Coordinate
  source: string
  confidence: number
  verified: false
}

export type CoordinateReviewStatus =
  | 'pending_review'
  | 'verified'
  | 'rejected'

/** 外部候选坐标的人工审核记录；不会直接改写正式站点数据。 */
export interface CoordinateReview {
  targetId: string
  candidateCoordinate: CandidateCoordinate
  source: string
  status: CoordinateReviewStatus
  reviewedAt: string | null
}

/** 地图 Provider 返回的步行路线；时长统一为秒，距离统一为米。 */
export interface WalkingRouteResult {
  distanceMeters: number
  durationSeconds: number
  polyline: Coordinate[]
}

/** 一次用户定位结果。accuracy 表示水平误差半径，单位为米。 */
export interface Location {
  coordinate: Coordinate
  accuracy: number
  isApproximate: boolean
  timestamp: number
}

/** 校园校车站点。坐标统一使用 GCJ-02。 */
export interface BusStopCoordinate extends Coordinate {
  verified: boolean
}

export interface BusStop {
  id: string
  name: string
  aliases?: string[]
  coordinate: BusStopCoordinate | null
  coordinateTodo?: string
  dataTodo?: string
}

/** Repository 已确认坐标可用于正式地图展示的站点。 */
export type VerifiedBusStop = BusStop & {
  coordinate: BusStopCoordinate & { verified: true }
}

/** 用户坐标到一个已验证校车站的空间查询结果。 */
export interface NearestStopResult {
  stopId: string
  stopName: string
  distanceMeters: number
  coordinate: Coordinate
}

/** 一条线路的一个行驶方向，stopIds 的顺序就是行驶顺序。 */
export interface BusDirection {
  name: string
  isLoop: boolean
  stopIds: string[]
  /** 图示明确重复经过、且不是环线首尾闭合的站点。 */
  allowedRepeatedStopIds?: string[]
}

/** 校车线路。正反方向分别建模，允许未来表达不同的单向站点。 */
export type RouteServiceType = 'fixed_stop' | 'flexible_campus_bus'

export type DataStatus = 'needs_review' | 'verified'

export type RouteDataStatus = DataStatus

export interface BusRoute {
  id: string
  name: string
  /** 固定站点线路，或允许站点集合不完整的校园灵活停靠线路。 */
  serviceType: RouteServiceType
  allowIntermediateStop: boolean
  /** 线路服务方式、方向和站序的人工复核状态。 */
  dataStatus: RouteDataStatus
  directions: BusDirection[]
}

export type CampusPOICategory =
  | 'library'
  | 'dormitory'
  | 'canteen'
  | 'building'
  | 'gate'
  | 'other'

/** 可搜索、可关联校车站点的校园地点；本阶段不包含推测坐标。 */
export interface CampusPOI {
  id: string
  name: string
  aliases: string[]
  category: CampusPOICategory
  relatedStopIds: string[]
  dataStatus: DataStatus
}

/** 从地点关联站点推导出的单线路直达候选。 */
export interface RouteRecommendation {
  routeId: string
  routeName: string
  matchedStopIds: string[]
  directions: string[]
  serviceType: RouteServiceType
  dataStatus: RouteDataStatus
  note?: string
}

/** 一次地点搜索及其线路推荐结果，保持领域语义而非页面展示结构。 */
export interface PoiRouteRecommendations {
  destination: CampusPOI
  routes: RouteRecommendation[]
}

/** 两个校园地点之间、按方向站序确认可直达的一条线路候选。 */
export interface RoutePathRecommendation {
  originPoiId: string
  destinationPoiId: string
  routeId: string
  routeName: string
  originStopIds: string[]
  destinationStopIds: string[]
  directions: string[]
  serviceType: RouteServiceType
  dataStatus: RouteDataStatus
  notes: string[]
}

/** 实时车辆能力的稳定边界；MVP 可使用返回空数组的实现。 */
export interface Vehicle {
  id: string
  routeId: string
  coordinate: Coordinate
  updatedAt: number
}

export interface VehicleLocationProvider {
  getVehicles(): Promise<Vehicle[]>
}
