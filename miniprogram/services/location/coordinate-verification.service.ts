import type {
  BusStopCoordinate,
  CoordinateReview,
} from '../../models/index'
import {
  coordinateReviewRepository,
  type CoordinateReviewRepository,
} from '../repository/coordinate-review.repository'

export interface CoordinateVerificationService {
  getAllReviews(): readonly CoordinateReview[]
  getPendingReviews(): readonly CoordinateReview[]
  getVerifiedCoordinates(): ReadonlyMap<string, BusStopCoordinate>
}

export function createCoordinateVerificationService(
  reviews: CoordinateReviewRepository,
): CoordinateVerificationService {
  return {
    getAllReviews: () => reviews.getAll(),
    getPendingReviews: () => reviews.getByStatus('pending_review'),
    getVerifiedCoordinates() {
      const coordinates = new Map<string, BusStopCoordinate>()
      for (const review of reviews.getByStatus('verified')) {
        const { latitude, longitude } = review.candidateCoordinate.coordinate
        coordinates.set(review.targetId, {
          latitude,
          longitude,
          verified: true,
        })
      }
      return coordinates
    },
  }
}

export const coordinateVerificationService =
  createCoordinateVerificationService(coordinateReviewRepository)
