import type {
  CampusPOI,
  CampusPOICategory,
  DataStatus,
} from '../../models/index'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isCategory(value: unknown): value is CampusPOICategory {
  return (
    value === 'library' ||
    value === 'dormitory' ||
    value === 'canteen' ||
    value === 'building' ||
    value === 'gate' ||
    value === 'other'
  )
}

function isDataStatus(value: unknown): value is DataStatus {
  return value === 'needs_review' || value === 'verified'
}

export function parsePoiData(value: unknown): readonly CampusPOI[] {
  if (!Array.isArray(value)) {
    throw new Error('pois.json 根节点必须是数组')
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`pois.json 第 ${index + 1} 项不是对象`)
    }

    const { id, name, aliases, category, relatedStopIds, dataStatus } = item
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      !isStringArray(aliases) ||
      !isCategory(category) ||
      !isStringArray(relatedStopIds) ||
      !isDataStatus(dataStatus)
    ) {
      throw new Error(`pois.json 第 ${index + 1} 项结构无效`)
    }

    return {
      id,
      name,
      aliases: [...aliases],
      category,
      relatedStopIds: [...relatedStopIds],
      dataStatus,
    }
  })
}
