import reviewsData from '../../data/coordinate-reviews.json'
import type {
  CandidateCoordinate,
  CoordinateReview,
  CoordinateReviewStatus,
} from '../../models/index'

export interface CoordinateReviewRepository {
  getAll(): readonly CoordinateReview[]
  getByStatus(
    status: CoordinateReviewStatus,
  ): readonly CoordinateReview[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCandidate(
  value: unknown,
  targetId: string,
): CandidateCoordinate {
  if (!isRecord(value) || !isRecord(value.coordinate)) {
    throw new Error(`坐标审核 ${targetId} 的 candidateCoordinate 无效`)
  }

  const { latitude, longitude } = value.coordinate
  const { source, confidence, verified } = value
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof source !== 'string' ||
    source.trim().length === 0 ||
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    verified !== false
  ) {
    throw new Error(`坐标审核 ${targetId} 的候选坐标结构无效`)
  }

  return {
    coordinate: { latitude, longitude },
    source,
    confidence,
    verified: false,
  }
}

function isReviewStatus(value: unknown): value is CoordinateReviewStatus {
  return (
    value === 'pending_review' ||
    value === 'verified' ||
    value === 'rejected'
  )
}

function parseReview(value: unknown, index: number): CoordinateReview {
  if (!isRecord(value)) {
    throw new Error(`coordinate-reviews.json 第 ${index + 1} 项不是对象`)
  }

  const { targetId, source, status, reviewedAt } = value
  if (
    typeof targetId !== 'string' ||
    targetId.trim().length === 0 ||
    typeof source !== 'string' ||
    source.trim().length === 0 ||
    !isReviewStatus(status) ||
    (reviewedAt !== null && typeof reviewedAt !== 'string')
  ) {
    throw new Error(`coordinate-reviews.json 第 ${index + 1} 项结构无效`)
  }

  if (status === 'pending_review' && reviewedAt !== null) {
    throw new Error(`待审核坐标 ${targetId} 的 reviewedAt 必须为 null`)
  }
  if (
    status !== 'pending_review' &&
    (typeof reviewedAt !== 'string' || reviewedAt.trim().length === 0)
  ) {
    throw new Error(`已处理坐标 ${targetId} 必须包含 reviewedAt`)
  }

  const candidateCoordinate = parseCandidate(
    value.candidateCoordinate,
    targetId,
  )
  if (candidateCoordinate.source !== source) {
    throw new Error(`坐标审核 ${targetId} 的 source 不一致`)
  }

  return {
    targetId,
    candidateCoordinate,
    source,
    status,
    reviewedAt,
  }
}

export function createStaticCoordinateReviewRepository(
  data: unknown,
): CoordinateReviewRepository {
  if (!Array.isArray(data)) {
    throw new Error('coordinate-reviews.json 根节点必须是数组')
  }
  const reviews = data.map(parseReview)

  return {
    getAll: () => reviews,
    getByStatus: (status) =>
      reviews.filter((review) => review.status === status),
  }
}

export const coordinateReviewRepository =
  createStaticCoordinateReviewRepository(reviewsData)
