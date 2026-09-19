/** 微信地图使用的 GCJ-02 坐标。 */
export interface Coordinate {
  latitude: number
  longitude: number
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
}

/** Repository 已确认坐标可用于正式地图展示的站点。 */
export type VerifiedBusStop = BusStop & {
  coordinate: BusStopCoordinate & { verified: true }
}

/** 一条线路的一个行驶方向，stopIds 的顺序就是行驶顺序。 */
export interface BusDirection {
  name: string
  stopIds: string[]
}

/** 校车线路。正反方向分别建模，允许未来表达不同的单向站点。 */
export interface BusRoute {
  id: string
  name: string
  directions: BusDirection[]
}

export type CampusPOICategory =
  | 'academic'
  | 'dormitory'
  | 'canteen'
  | 'library'
  | 'sports'
  | 'gate'
  | 'delivery'
  | 'other'

/** 可被搜索和导航的校园地点。 */
export interface CampusPOI {
  id: string
  name: string
  aliases?: string[]
  category: CampusPOICategory
  coordinate: Coordinate
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
