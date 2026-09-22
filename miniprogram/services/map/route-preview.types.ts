import type { CandidateCoordinate, Coordinate } from '../../models/index'

/** Experimental output only: never a verified stop or production route geometry. */
export interface RoutePreviewCandidate {
  stopId: string
  query: string
  candidate: CandidateCoordinate | null
  usableForPreview: boolean
  warnings: string[]
}

/** Each segment is independent; missing segments must not be joined by straight lines. */
export interface RoutePreviewSegment {
  routeId: string
  directionId: string
  fromStopId: string
  toStopId: string
  points: Coordinate[]
  source: 'tencent_driving'
  dataStatus: 'needs_review'
}

export interface RoutePreviewData {
  generatedAt: string | null
  candidates: RoutePreviewCandidate[]
  segments: RoutePreviewSegment[]
  warnings: string[]
}
