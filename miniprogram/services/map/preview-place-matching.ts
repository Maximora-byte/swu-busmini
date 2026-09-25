import type { BusStop } from '../../models/index'
import type { TencentPlaceCandidate } from './tencent/tencent-map.provider'

/** Search aliases only, not newly approved stop names or positions. */
export const PREVIEW_PLACE_NAMES: Readonly<Record<string, string>> = {
  jingguanyuan: '经济管理学院',
  building_8: '第八教学楼',
  tianjiabing: '田家炳',
  building_5: '5教学楼',
  canteen_2: '第二食堂',
  geosciences: '地理科学学院',
  foreign_languages: '外国语学院',
  building_26: '26教学楼',
  zhongtu: '中心图书馆',
}

function normalizeName(name: string): string {
  const digits: Readonly<Record<string, number>> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  return name.replace(/西南大学|北碚校区|北碚|[()（）\s\-·]/g, '')
    .replace(/[一二三四五六七八九]?十[一二三四五六七八九]?|[一二三四五六七八九]/g, (value) => {
      const parts = value.split('十')
      return String(parts.length === 1 ? digits[value] : (digits[parts[0]!] ?? 1) * 10 + (digits[parts[1]!] ?? 0))
    })
    .replace(/第(\d+)/g, '$1').replace(/号?教学楼/g, '教')
}

export function matchPreviewPlaces(stop: BusStop, places: readonly TencentPlaceCandidate[]): TencentPlaceCandidate[] {
  const names = new Set([stop.name, ...(stop.aliases ?? []), PREVIEW_PLACE_NAMES[stop.id] ?? stop.name].map(normalizeName))
  // A school context and exact name are both required. A numbered dorm/entrance is not its parent POI.
  const matches = places.filter((place) => (place.title.includes('西南大学') || place.address.includes('西南大学')) && names.has(normalizeName(place.title)))
  return [...new Map(matches.map((place) => [place.id, place])).values()]
}
