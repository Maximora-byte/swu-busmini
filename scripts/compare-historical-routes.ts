import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TransitDataset } from '../miniprogram/models/current-transit'

export interface HistoricalRouteLabels {
  historicalRouteNumber: number
  historicalRowLabels: string[]
  currentRouteId: string | null
}

export interface CurrentRouteLabels {
  id: string
  sourceStationNames: string[]
  geometryVisitNames: string[]
  visitSourceIndices: number[]
  warnings: string[]
}

type Candidate = {
  currentLabel: string
  sourceIndex: number
  geometryVisitIndices: number[]
  kind: 'confirmed_semantic' | 'composite_or_area'
  reason: string
}

// Reviewed transcription, not a historical complete stop inventory or georeferenced route.
export const historicalRoutes: HistoricalRouteLabels[] = [
  ['经管院', '六号门', '二号门', '八教', '田家炳', '圆顶', '五号门'],
  ['经管院', '六号门', '二号门', '八教', '田家炳', '西师街', '五号门'],
  ['竹园', '二号门', '五教', '梅园', '橘园', '五号门'],
  ['二号门', '二食堂', '地科院', '外语学院', '二十六教', '梅园', '橘园'],
  ['二号门', '八教', '田家炳', '圆顶', '五号门'],
  ['竹园', '二号门', '梅园', '橘园', '田家炳', '八教', '二号门', '竹园'],
  ['二号门', '地科院', '五教', '26教', '梅园', '橘园', '田家炳', '李园', '大礼堂', '二号门'],
  ['音乐学院', '八教', '田家炳', '橘园', '梅园', '外语学院', '音乐学院'],
  ['竹园', '二号门', '八教', '田家炳', '圆顶', '五号门', '橘园', '梅园', '中图', '二号门', '竹园'],
].map((historicalRowLabels, index) => ({
  historicalRouteNumber: index + 1,
  historicalRowLabels,
  currentRouteId: index < 8 ? `route_${index + 1}` : null,
}))

const semanticAliases: Record<string, string> = {
  二号门: '2号门', 五号门: '5号门', 六号门: '6号门',
  八教: '8教', '8教学楼': '8教', 二十六教: '26教',
  五教: '外语学院', '5教': '外语学院', 外国语学院: '外语学院',
}

// These are explicitly weaker area/component candidates, never stop-ID equivalences.
const plausibleLabels: Record<string, string[]> = {
  '2号门': ['共青花园2号门', '共青团花园2号门', '共青花园、2号门'],
  '8教': ['8教李园'],
  地科院: ['中心图书馆地科院'],
  田家炳: ['田家炳文学院'],
  竹园: ['后山竹园'],
  梅园: ['梅园1舍', '梅园食堂'],
  橘园: ['橘园10舍', '橘园12舍', '橘11', '橘园新七舍'],
}

function key(label: string): string {
  const trimmed = label.trim()
  return semanticAliases[trimmed] ?? trimmed
}

function ratio(numerator: number, denominator: number) {
  return { numerator, denominator, percent: denominator === 0 ? null : Math.round(10000 * numerator / denominator) / 100 }
}

function classify(historicalLabel: string, currentLabel: string): Pick<Candidate, 'kind' | 'reason'> | null {
  if (key(historicalLabel) === key(currentLabel)) {
    const reason = ['五教', '5教'].includes(historicalLabel.trim()) || ['五教', '5教'].includes(currentLabel.trim())
      ? '2024 overview building #5 = 外国语学院; semantic building alias only, not identical stop coordinates'
      : historicalLabel === currentLabel ? 'same full label' : 'reviewed numeric/building-name synonym'
    return { kind: 'confirmed_semantic', reason }
  }
  if (plausibleLabels[key(historicalLabel)]?.includes(currentLabel)) {
    return { kind: 'composite_or_area', reason: 'explicit compound component or broader area candidate; stop equivalence unconfirmed' }
  }
  return null
}

// Reuse the reviewed semantic rules for cross-route analysis without assuming route identity.
export { key as normalizeHistoricalLandmark, classify as classifyHistoricalLandmark }

// LCS on matched landmark candidates only. One current position can be consumed once.
// Ambiguous candidate assignments maximize this score; no rotation or closing edge is added.
function longestCandidateSubsequence(candidateIndices: number[][], sequence: number[]): number {
  let previous = new Array<number>(sequence.length + 1).fill(0)
  for (const indices of candidateIndices) {
    const row = new Array<number>(sequence.length + 1).fill(0)
    for (let j = 1; j <= sequence.length; j++) {
      row[j] = indices.includes(sequence[j - 1])
        ? Math.max(previous[j - 1] + 1, previous[j], row[j - 1])
        : Math.max(previous[j], row[j - 1])
    }
    previous = row
  }
  return previous[sequence.length]
}

export function compareHistoricalRoute(historical: HistoricalRouteLabels, current: CurrentRouteLabels | null) {
  const seen = new Set<string>()
  const unique = historical.historicalRowLabels.filter((label) => {
    if (seen.has(key(label))) return false
    seen.add(key(label))
    return true
  })
  const matches = unique.map((historicalLabel) => ({
    historicalLabel,
    normalizedKey: key(historicalLabel),
    historicalOccurrenceIndices: historical.historicalRowLabels.flatMap((label, i) => key(label) === key(historicalLabel) ? [i] : []),
    candidates: (current?.sourceStationNames ?? []).flatMap((currentLabel, sourceIndex): Candidate[] => {
      const classification = classify(historicalLabel, currentLabel)
      if (!classification) return []
      return [{ currentLabel, sourceIndex, geometryVisitIndices: current!.visitSourceIndices.flatMap((index, i) => index === sourceIndex ? [i] : []), ...classification }]
    }),
  }))
  const confirmedCount = matches.filter(({ candidates }) => candidates.some(({ kind }) => kind === 'confirmed_semantic')).length
  const plausibleCount = matches.filter(({ candidates }) => candidates.length > 0).length
  function order(includePlausible: boolean) {
    const covered = matches.map((match) => ({
      historicalLabel: match.historicalLabel,
      candidates: match.candidates.filter(({ kind }) => includePlausible || kind === 'confirmed_semantic'),
    })).filter(({ candidates }) => candidates.length > 0)
    const candidateIndices = covered.map(({ candidates }) => candidates.map(({ sourceIndex }) => sourceIndex))
    function sequenceScores(sequence: number[]) {
      return {
        forward: ratio(longestCandidateSubsequence(candidateIndices, sequence), covered.length),
        reverse: ratio(longestCandidateSubsequence(candidateIndices, [...sequence].reverse()), covered.length),
      }
    }
    return {
      matchedHistoricalLabels: covered.map(({ historicalLabel }) => historicalLabel),
      ambiguousHistoricalLabels: covered.filter(({ candidates }) => candidates.length > 1 || candidates.some(({ geometryVisitIndices }) => geometryVisitIndices.length !== 1)).map(({ historicalLabel }) => historicalLabel),
      geometry: sequenceScores(current!.visitSourceIndices),
      sourceArray: sequenceScores(current!.sourceStationNames.map((_, i) => i)),
    }
  }
  return {
    historicalRouteNumber: historical.historicalRouteNumber,
    currentRouteId: current?.id ?? null,
    status: current ? 'compared_semantic_landmarks_only' : 'no_current_catalog_counterpart',
    historicalRowLabels: historical.historicalRowLabels,
    historicalRawLabelCount: historical.historicalRowLabels.length,
    historicalUniqueLabelCount: unique.length,
    currentSourceStationNames: current?.sourceStationNames ?? [],
    currentGeometryVisitNames: current?.geometryVisitNames ?? [],
    currentVisitSourceIndices: current?.visitSourceIndices ?? [],
    currentGeometryWarnings: current?.warnings ?? [],
    confirmedCoverage: current ? ratio(confirmedCount, unique.length) : null,
    plausibleCoverageUpperBound: current ? ratio(plausibleCount, unique.length) : null,
    plausibleOnlyHistoricalLabels: matches.filter(({ candidates }) => candidates.length && !candidates.some(({ kind }) => kind === 'confirmed_semantic')).map(({ historicalLabel }) => historicalLabel),
    unmatchedHistoricalLabels: current ? matches.filter(({ candidates }) => !candidates.length).map(({ historicalLabel }) => historicalLabel) : [],
    matches,
    order: current ? { confirmed: order(false), includingPlausible: order(true) } : null,
  }
}

export function buildHistoricalRouteReport(root = process.cwd()) {
  const currentPath = 'miniprogram/data/current-transit.json'
  const sourcePath = 'miniprogram/data/current-transit-source.json'
  const currentBytes = readFileSync(resolve(root, currentPath))
  const sourceBytes = readFileSync(resolve(root, sourcePath))
  const current: TransitDataset = JSON.parse(currentBytes.toString('utf8'))
  const source: { observedAt: string; routes: { id: string; name: string; stations: { name: string }[] }[] } = JSON.parse(sourceBytes.toString('utf8'))
  const stopNames = new Map(current.stops.map(({ id, name }) => [id, name]))
  const routes = historicalRoutes.map((historical) => {
    const raw = source.routes.find(({ id }) => id === historical.currentRouteId)
    const projected = current.routes.find(({ id }) => id === historical.currentRouteId)
    if (!historical.currentRouteId) return compareHistoricalRoute(historical, null)
    if (!raw || !projected) throw new Error(`Missing expected current route ${historical.currentRouteId}`)
    const geometryVisitNames = projected.visits.map(({ stopId, sourceIndex }) => {
      const name = stopNames.get(stopId)
      if (!name || raw.stations[sourceIndex]?.name !== name) throw new Error(`Source/visit mismatch: ${projected.id}/${sourceIndex}`)
      return name
    })
    return compareHistoricalRoute(historical, {
      id: projected.id, sourceStationNames: raw.stations.map(({ name }) => name),
      geometryVisitNames, visitSourceIndices: projected.visits.map(({ sourceIndex }) => sourceIndex), warnings: projected.warnings,
    })
  })
  const compared = routes.filter(({ confirmedCoverage }) => confirmedCoverage !== null)
  const denominator = compared.reduce((sum, route) => sum + route.historicalUniqueLabelCount, 0)
  const common = historicalRoutes.filter(({ currentRouteId }) => source.routes.some(({ id }) => id === currentRouteId))
  return {
    schemaVersion: 1,
    observedAt: source.observedAt,
    historicalYear: 2024,
    source: {
      historical: 'User-supplied 2024 campus overview and nine-row route schematic; reviewed label transcription only',
      historicalImageSha256: ['b731745027d97fc1c34502492583f9d93f78799d603b3a2f5682163c8c55fc1a', 'cc1514f6a1722adad73e76b41af001a0d09626337f5de49c5ab5651d99859f81'],
      current: [
        { path: currentPath, sha256: createHash('sha256').update(currentBytes).digest('hex') },
        { path: sourcePath, sha256: createHash('sha256').update(sourceBytes).digest('hex') },
      ],
    },
    definitions: {
      catalog: 'Same route identity/number only. Common / historical, common / current, and common / union have distinct denominators. No renaming inferred.',
      confirmedCoverage: 'Unique normalized historical landmarks with at least one full-label or reviewed synonym match / all unique normalized historical landmarks on that route. Semantic coverage, not bus-stop or geometry accuracy.',
      plausibleCoverageUpperBound: 'Same denominator, adding explicitly reviewed compound-component or broader-area candidates. A liberal semantic ceiling, not verified stop coverage or a statistical confidence interval.',
      duplicates: 'Normalize before deduplicating historical labels; retain first occurrence for order. Repeated endpoint/intermediate labels remain recorded but do not increase the coverage denominator.',
      order: 'LCS of first-occurrence matched historical landmarks against current source-index positions / matched unique historical landmark count, separately forward and reverse. Geometry uses actual visits; sourceArray is diagnostic. All candidate positions are retained; multi-candidate LCS is a maximum feasible alignment, not a unique alignment. Unmatched landmarks are excluded ONLY from the order denominator. No rotation, inferred closing edge or invented return visits.',
      noCounterpart: 'Historical 9 has no current catalog counterpart. Coverage and order are null (N/A), not zero; snapshot absence does not establish withdrawal.',
      aggregation: 'Micro coverage sums numerators/denominators across eight comparable route rows; the same landmark on two different routes counts once per route. Historical 9 excluded. Macro coverage averages the eight route percentages before rounding.',
      limitations: 'Historical schematic has no georeferenced polyline, complete stop inventory, verified operation direction, or current loop closure. Pixel shape, actual-stop accuracy and operational direction cannot be measured.',
    },
    aliasRules: { semanticAliases, fiveBuildingEvidence: 'User-supplied 2024 overview labels building #5 外国语学院; semantic building reference only.', plausibleLabels, forbiddenSubstitutions: ['六号门 = 资环院/32教', '二食堂 = 楠园', '26教 = 药学院', '李园 = 八教', '9路 = 3路B线/经管专线'] },
    catalog: {
      historicalCount: historicalRoutes.length, currentCount: source.routes.length, commonCount: common.length,
      commonHistoricalRouteNumbers: common.map(({ historicalRouteNumber }) => historicalRouteNumber),
      historicalNumberCoverage: ratio(common.length, historicalRoutes.length),
      currentCatalogCoverage: ratio(common.length, source.routes.length),
      identityJaccard: ratio(common.length, historicalRoutes.length + source.routes.length - common.length),
      historicalWithoutCurrentCounterpart: historicalRoutes.filter(({ currentRouteId }) => !currentRouteId).map(({ historicalRouteNumber }) => historicalRouteNumber),
      currentWithoutHistoricalCounterpart: source.routes.filter(({ id }) => !historicalRoutes.some(({ currentRouteId }) => currentRouteId === id)).map(({ id, name }) => ({ id, name })),
    },
    aggregateCoverage: {
      comparableRouteCount: compared.length,
      confirmedMicro: ratio(compared.reduce((sum, route) => sum + route.confirmedCoverage!.numerator, 0), denominator),
      plausibleUpperBoundMicro: ratio(compared.reduce((sum, route) => sum + route.plausibleCoverageUpperBound!.numerator, 0), denominator),
      confirmedMacroPercent: Math.round(compared.reduce((sum, route) => sum + 100 * route.confirmedCoverage!.numerator / route.confirmedCoverage!.denominator, 0) / compared.length * 100) / 100,
      plausibleUpperBoundMacroPercent: Math.round(compared.reduce((sum, route) => sum + 100 * route.plausibleCoverageUpperBound!.numerator / route.plausibleCoverageUpperBound!.denominator, 0) / compared.length * 100) / 100,
    },
    routes,
  }
}

if (process.argv[1] && /compare-historical-routes\.(ts|js)$/.test(process.argv[1])) {
  const report = buildHistoricalRouteReport()
  const outIndex = process.argv.indexOf('--out')
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (outIndex >= 0) {
    if (!process.argv[outIndex + 1]) throw new Error('--out requires an output file')
    writeFileSync(resolve(process.argv[outIndex + 1]), serialized, 'utf8')
  } else {
    process.stdout.write(serialized)
  }
}
