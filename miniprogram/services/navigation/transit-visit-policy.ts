import type { TransitVisit } from '../../models/current-transit'

export const MAX_AUTOMATIC_BOARDING_OFFSET_METERS = 35

/** Route-scoped eligibility only; this does not move a station or establish service. */
export function isAutomaticBoardingVisit(visit: Pick<TransitVisit, 'offsetMeters'>): boolean {
  return Number.isFinite(visit.offsetMeters) && visit.offsetMeters >= 0 &&
    visit.offsetMeters <= MAX_AUTOMATIC_BOARDING_OFFSET_METERS
}
