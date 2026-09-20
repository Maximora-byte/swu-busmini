import type { BusStop, CampusPOICategory, DataStatus } from '../../models/index'

export type PoiDataValidationIssueCode =
  | 'invalid_poi_data'
  | 'duplicate_poi_id'
  | 'unknown_stop'
  | 'empty_alias'
  | 'invalid_category'
  | 'invalid_data_status'

export interface PoiDataValidationIssue {
  code: PoiDataValidationIssueCode
  poiId?: string
  stopId?: string
  message: string
}

export interface PoiDataValidationResult {
  valid: boolean
  issues: readonly PoiDataValidationIssue[]
}

const CATEGORIES: ReadonlySet<CampusPOICategory> = new Set([
  'library',
  'dormitory',
  'canteen',
  'building',
  'gate',
  'other',
])

const DATA_STATUSES: ReadonlySet<DataStatus> = new Set([
  'needs_review',
  'verified',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addIssue(
  issues: PoiDataValidationIssue[],
  code: PoiDataValidationIssueCode,
  message: string,
  poiId?: string,
  stopId?: string,
): void {
  issues.push({ code, message, poiId, stopId })
}

export function validatePoiData(
  value: unknown,
  stops: readonly BusStop[],
): PoiDataValidationResult {
  const issues: PoiDataValidationIssue[] = []
  if (!Array.isArray(value)) {
    addIssue(issues, 'invalid_poi_data', 'pois.json root must be an array')
    return { valid: false, issues }
  }

  const knownStopIds = new Set(stops.map(({ id }) => id))
  const poiIds = new Set<string>()

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      addIssue(
        issues,
        'invalid_poi_data',
        `POI at index ${index} must be an object`,
      )
      return
    }

    const poiId = typeof item.id === 'string' ? item.id : undefined
    if (!poiId || typeof item.name !== 'string') {
      addIssue(
        issues,
        'invalid_poi_data',
        `POI at index ${index} must have string id and name`,
        poiId,
      )
    } else if (poiIds.has(poiId)) {
      addIssue(
        issues,
        'duplicate_poi_id',
        `Duplicate POI id: ${poiId}`,
        poiId,
      )
    }
    if (poiId) {
      poiIds.add(poiId)
    }

    if (!Array.isArray(item.aliases)) {
      addIssue(
        issues,
        'invalid_poi_data',
        `POI ${poiId ?? index} aliases must be an array`,
        poiId,
      )
    } else {
      for (const alias of item.aliases) {
        if (typeof alias !== 'string' || alias.trim().length === 0) {
          addIssue(
            issues,
            'empty_alias',
            `POI ${poiId ?? index} contains an empty alias`,
            poiId,
          )
        }
      }
    }

    if (
      typeof item.category !== 'string' ||
      !CATEGORIES.has(item.category as CampusPOICategory)
    ) {
      addIssue(
        issues,
        'invalid_category',
        `POI ${poiId ?? index} has invalid category ${String(item.category)}`,
        poiId,
      )
    }

    if (
      typeof item.dataStatus !== 'string' ||
      !DATA_STATUSES.has(item.dataStatus as DataStatus)
    ) {
      addIssue(
        issues,
        'invalid_data_status',
        `POI ${poiId ?? index} must have a valid dataStatus`,
        poiId,
      )
    }

    if (!Array.isArray(item.relatedStopIds)) {
      addIssue(
        issues,
        'invalid_poi_data',
        `POI ${poiId ?? index} relatedStopIds must be an array`,
        poiId,
      )
      return
    }

    for (const stopId of item.relatedStopIds) {
      if (typeof stopId !== 'string') {
        addIssue(
          issues,
          'invalid_poi_data',
          `POI ${poiId ?? index} contains a non-string stop id`,
          poiId,
        )
      } else if (!knownStopIds.has(stopId)) {
        addIssue(
          issues,
          'unknown_stop',
          `POI ${poiId ?? index} references unknown stop ${stopId}`,
          poiId,
          stopId,
        )
      }
    }
  })

  return { valid: issues.length === 0, issues }
}
