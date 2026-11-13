import type { TransitDataset } from '../../models/current-transit'
import { currentTransitRepository } from '../repository/current-transit.repository'
import { isAutomaticBoardingVisit } from './transit-visit-policy'

export interface TransitStopSuggestion {
  stopId: string
  name: string
  label: string
  routeNames: string[]
}

const ALIASES: readonly (readonly string[])[] = [
  ['中心图书馆', '图书馆', '中图', '西大图书馆'],
  ['经管院', '经管', '经济管理学院'],
  ['资环院', '资环', '资源环境学院'],
  ['外国语学院', '外语学院', '外院'],
  ['共青团花园', '共青花园'],
]

function chineseNumber(value: string): string {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (value.includes('百')) return value // No published building/gate number needs hundreds.
  if (value.includes('十')) {
    const [tens, ones] = value.split('十')
    return String((tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0))
  }
  return [...value].map((character) => digits[character]).join('')
}

function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/[！-～]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[零〇一二两三四五六七八九十百]+/g, chineseNumber)
    .replace(/第(?=\d)/g, '')
    .replace(/教学(?:大)?楼/g, '教')
    .replace(/(?:号|大|校)门/g, '门')
    .replace(/[\s·、，,。．（）()【】\[\]_-]/g, '')
}

function aliases(name: string): string[] {
  const terms = new Set<string>([name])
  for (const group of ALIASES) {
    const existing = group.find((term) => name.includes(term))
    if (existing) group.forEach((term) => { terms.add(term); terms.add(name.replace(existing, term)) })
  }
  const normalized = normalize(name)
  const shortDormitory = /^橘(\d+)$/.exec(normalized)
  if (shortDormitory) terms.add(`橘园${shortDormitory[1]}舍`)
  return [...new Set([...terms].map(normalize))]
}

/** One insertion, deletion, substitution or adjacent transposition; never an unbounded edit search. */
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue }
    if (++edits > 1) return false
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2 }
    else if (a.length > b.length) i += 1
    else if (b.length > a.length) j += 1
    else { i += 1; j += 1 }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

export function createTransitStopSearchService(dataset: TransitDataset) {
  const entries = dataset.stops.flatMap((stop, order) => {
    const routeNames = dataset.routes.filter((route) => route.visits.some((visit) =>
      visit.stopId === stop.id && isAutomaticBoardingVisit(visit))).map(({ name }) => name)
    return routeNames.length ? [{
      stopId: stop.id, name: stop.name, routeNames,
      label: `${stop.name} · ${routeNames.join('/')}`,
      normalizedName: normalize(stop.name), terms: aliases(stop.name), order,
    }] : []
  })
  return {
    search(keyword: string): TransitStopSuggestion[] {
      if (typeof keyword !== 'string' || keyword.length > 64) return []
      const query = normalize(keyword)
      if (!query) return []
      const queryNumbers: string[] = query.match(/\d+/g) ?? []
      const ranked = entries.flatMap((entry) => {
        let rank = Infinity
        for (const term of entry.terms) {
          const termNumbers: string[] = term.match(/\d+/g) ?? []
          if (queryNumbers.some((number) => !termNumbers.includes(number))) continue
          const canonical = term === entry.normalizedName
          if (term === query) rank = Math.min(rank, canonical ? 0 : 1)
          else if (term.startsWith(query)) rank = Math.min(rank, canonical ? 2 : 3)
          else if (term.includes(query)) rank = Math.min(rank, canonical ? 4 : 5)
          else if (query.length >= 3 && queryNumbers.length === termNumbers.length && oneEdit(query, term)) rank = Math.min(rank, 6)
        }
        return Number.isFinite(rank) ? [{ entry, rank }] : []
      })
      return ranked.sort((a, b) => a.rank - b.rank || a.entry.order - b.entry.order).slice(0, 12)
        .map(({ entry: { stopId, name, label, routeNames } }) => ({ stopId, name, label, routeNames: [...routeNames] }))
    },
  }
}

export const transitStopSearchService = createTransitStopSearchService(currentTransitRepository.getDataset())
