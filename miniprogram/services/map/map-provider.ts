import type {
  CandidateCoordinate,
  Coordinate,
  WalkingRouteResult,
} from '../../models/index'

/** 可替换的地图能力边界，不包含任何校园校车业务判断。 */
export interface MapProvider {
  geocode(keyword: string): Promise<readonly CandidateCoordinate[]>
  reverseGeocode(coordinate: Coordinate): Promise<string>
  walkingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<WalkingRouteResult>
}
