import type { BusStop, VerifiedBusStop } from '../../models/index'
import {
  coordinateVerificationService,
  type CoordinateVerificationService,
} from '../location/coordinate-verification.service'
import {
  busStopRepository,
  type BusStopRepository,
} from './bus-stop.repository'

export function createReviewedBusStopRepository(
  stops: BusStopRepository,
  verification: CoordinateVerificationService,
): BusStopRepository {
  for (const review of verification.getAllReviews()) {
    if (!stops.findById(review.targetId)) {
      throw new Error(`坐标审核引用了不存在的站点: ${review.targetId}`)
    }
  }

  const verifiedCoordinates = verification.getVerifiedCoordinates()

  function applyVerifiedReview(stop: BusStop): BusStop {
    if (stop.coordinate !== null) {
      return stop
    }
    const coordinate = verifiedCoordinates.get(stop.id)
    return coordinate ? { ...stop, coordinate } : stop
  }

  function getAll(): readonly BusStop[] {
    return stops.getAll().map(applyVerifiedReview)
  }

  return {
    getAll,
    getVerifiedStops: () =>
      getAll().filter(
        (stop): stop is VerifiedBusStop =>
          stop.coordinate?.verified === true,
      ),
    findById(id) {
      const stop = stops.findById(id)
      return stop ? applyVerifiedReview(stop) : undefined
    },
    getByIds: (ids) => stops.getByIds(ids).map(applyVerifiedReview),
  }
}

export const reviewedBusStopRepository = createReviewedBusStopRepository(
  busStopRepository,
  coordinateVerificationService,
)
