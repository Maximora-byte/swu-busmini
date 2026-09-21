import type { CoordinateReview } from '../models/index'

/** 微信运行时使用的坐标审核数据 Adapter。 */
export const coordinateReviews: readonly CoordinateReview[] = [
  {
    targetId: 'library',
    candidateCoordinate: {
      coordinate: {
        latitude: 29.820659,
        longitude: 106.423923,
      },
      source: 'tencent',
      confidence: 0.99,
      verified: false,
    },
    source: 'tencent',
    status: 'pending_review',
    reviewedAt: null,
  },
]
