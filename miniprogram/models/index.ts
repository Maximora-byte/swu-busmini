/** 校园校车站点。坐标统一使用 GCJ-02。 */
export interface BusStop {
  id: string
  name: string
  aliases?: string[]
  latitude: number
  longitude: number
}

/** 一条线路的一个行驶方向；返程方向应保存为独立记录。 */
export interface BusRoute {
  id: string
  name: string
  direction: string
  stopIds: string[]
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
  latitude: number
  longitude: number
}

/** 实时车辆能力的稳定边界；MVP 可使用返回空数组的实现。 */
export interface Vehicle {
  id: string
  routeId: string
  latitude: number
  longitude: number
  updatedAt: number
}

export interface VehicleLocationProvider {
  getVehicles(): Promise<Vehicle[]>
}

