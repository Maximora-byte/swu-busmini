import poisData from '../../data/pois.json'
import type { CampusPOI } from '../../models/index'
import { parsePoiData } from './poi-data.parser'

export interface PoiRepository {
  getAll(): readonly CampusPOI[]
  findById(id: string): CampusPOI | undefined
  search(keyword: string): readonly CampusPOI[]
}

export function createStaticPoiRepository(data: unknown): PoiRepository {
  const pois = parsePoiData(data)
  const poisById = new Map<string, CampusPOI>()

  for (const poi of pois) {
    if (poisById.has(poi.id)) {
      throw new Error(`pois.json 存在重复 POI id: ${poi.id}`)
    }
    poisById.set(poi.id, poi)
  }

  return {
    getAll: () => pois,
    findById: (id) => poisById.get(id),
    search(keyword) {
      const normalizedKeyword = keyword.trim().toLocaleLowerCase()
      if (normalizedKeyword.length === 0) {
        return []
      }
      return pois.filter((poi) =>
        [poi.name, ...poi.aliases].some((candidate) =>
          candidate.toLocaleLowerCase().includes(normalizedKeyword),
        ),
      )
    },
  }
}

export const poiRepository = createStaticPoiRepository(poisData)
