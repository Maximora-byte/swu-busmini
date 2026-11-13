import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TransitDataset } from '../miniprogram/models/current-transit'
import { historicalRoutes, normalizeHistoricalLandmark, classifyHistoricalLandmark, type HistoricalRouteLabels } from './compare-historical-routes'

export interface CrossRoute {
  id: string; name: string; sequence: string[]; sourceSequence: string[]; warnings: string[]
}
const rounded = (value: number) => Math.round(value * 100) / 100
const unique = <T>(values: T[]) => [...new Set(values)]
const landmark = (label: string) => normalizeHistoricalLandmark(label.trim() === '中图' ? '中心图书馆' : label)
function kind(old: string, current: string): 'confirmed_semantic' | 'composite_or_area' | undefined {
  const result = classifyHistoricalLandmark(landmark(old), landmark(current))
  if (result) return result.kind
  if ((landmark(old) === '中心图书馆' && current === '中心图书馆地科院') || (landmark(old) === '李园' && current === '8教李园')) return 'composite_or_area'
  return undefined
}
function weight(old: string, current: string, alpha: number): number {
  const value = kind(old, current)
  return value === 'confirmed_semantic' ? 1 : value === 'composite_or_area' ? alpha : 0
}
function weightedLcs(old: string[], current: string[], alpha: number): number {
  let previous = new Array<number>(current.length + 1).fill(0)
  for (const point of old) {
    const row = new Array<number>(current.length + 1).fill(0)
    for (let j = 1; j <= current.length; j++) row[j] = Math.max(previous[j], row[j - 1], previous[j - 1] + weight(point, current[j - 1], alpha))
    previous = row
  }
  return previous[current.length]
}

/** A documented heuristic on landmarks, never a route-identity probability or physical overlap. */
export function scoreCrossRoutePair(historical: HistoricalRouteLabels, current: CrossRoute, vocabulary: readonly string[], alpha: number) {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error('Uncertain landmark weight must be within [0, 1]')
  const raw = historical.historicalRowLabels.map(landmark), old = unique(raw)
  const pool = unique([...vocabulary.map(landmark), ...old])
  const currentWeights = pool.map((point) => ({ landmark: point, weight: Math.max(0, ...current.sequence.map((name) => weight(point, name, alpha))) }))
  const intersection = currentWeights.filter(({ landmark: point }) => old.includes(point)).reduce((sum, point) => sum + point.weight, 0)
  const currentMass = currentWeights.reduce((sum, point) => sum + point.weight, 0)
  const dice = old.length + currentMass ? 2 * intersection / (old.length + currentMass) : 0
  const orientation = (sequence: string[]) => {
    const order = old.length ? weightedLcs(old, sequence, alpha) / old.length : 0
    const endpoints = raw.length && sequence.length ? (weight(raw[0], sequence[0], alpha) + weight(raw[raw.length - 1], sequence[sequence.length - 1], alpha)) / 2 : 0
    return { score: 100 * (.6 * dice + .3 * order + .1 * endpoints), orderCoverage: 100 * order, endpointAgreement: 100 * endpoints }
  }
  const forward = orientation(current.sequence), reverse = orientation([...current.sequence].reverse())
  const selected = forward.score >= reverse.score ? forward : reverse
  const matches = old.map((point) => ({
    landmark: point,
    currentLabels: unique(current.sequence).flatMap((name) => {
      const classification = kind(point, name)
      return classification ? [{ name, kind: classification, weight: weight(point, name, alpha) }] : []
    }),
  }))
  return {
    currentRouteId: current.id, currentRouteName: current.name,
    score: rounded(selected.score), rawScore: selected.score,
    referenceOrientation: Math.abs(forward.score - reverse.score) < 1e-9 ? 'tied' : forward.score > reverse.score ? 'forward' : 'reverse',
    components: { landmarkDice: rounded(100 * dice), orderCoverage: rounded(selected.orderCoverage), endpointAgreement: rounded(selected.endpointAgreement) },
    orientationScores: { forward, reverse },
    historicalUniqueLandmarkCount: old.length, historicalRepeatedEndpoint: raw.length > 1 && raw[0] === raw[raw.length - 1],
    confirmedLandmarks: matches.filter(({ currentLabels }) => currentLabels.some(({ kind }) => kind === 'confirmed_semantic')).map(({ landmark }) => landmark),
    uncertainOnlyLandmarks: matches.filter(({ currentLabels }) => currentLabels.length && !currentLabels.some(({ kind }) => kind === 'confirmed_semantic')).map(({ landmark }) => landmark),
    unmatchedHistoricalLandmarks: matches.filter(({ currentLabels }) => !currentLabels.length).map(({ landmark }) => landmark),
    comparableCurrentLandmarks: currentWeights.filter(({ weight }) => weight > 0),
    unassessedCurrentLabels: unique(current.sequence).filter((name) => !pool.some((point) => kind(point, name))),
  }
}

export function rankCrossRoutes(histories: readonly HistoricalRouteLabels[], currents: readonly CrossRoute[], alpha = .5) {
  const vocabulary = unique(histories.flatMap(({ historicalRowLabels }) => historicalRowLabels.map(landmark)))
  return histories.map((historical) => {
    const candidates = currents.map((current, index) => ({ ...scoreCrossRoutePair(historical, current, vocabulary, alpha), index }))
      .sort((a, b) => b.rawScore - a.rawScore || a.index - b.index).map(({ index: _index, ...candidate }) => candidate)
    const first = candidates[0]?.rawScore ?? 0
    return { historicalRouteNumber: historical.historicalRouteNumber,
      bestCandidateIds: first > 0 ? candidates.filter(({ rawScore }) => Math.abs(rawScore - first) < 1e-9).map(({ currentRouteId }) => currentRouteId) : [],
      topMargin: candidates.length > 1 ? rounded(first - candidates[1].rawScore) : null,
      candidates }
  })
}

export function buildCrossRouteReport(root = process.cwd()) {
  const paths = ['miniprogram/data/current-transit.json', 'miniprogram/data/current-transit-source.json']
  const bytes = paths.map((path) => readFileSync(resolve(root, path)))
  const dataset: TransitDataset = JSON.parse(bytes[0].toString('utf8'))
  const source: { observedAt: string; routes: { id: string; name: string; stations: { name: string }[] }[] } = JSON.parse(bytes[1].toString('utf8'))
  const stopNames = new Map(dataset.stops.map(({ id, name }) => [id, name]))
  const currents: CrossRoute[] = dataset.routes.map((route) => {
    const raw = source.routes.find(({ id }) => id === route.id)
    if (!raw) throw new Error('Missing source route')
    const sequence = route.visits.map(({ sourceIndex, stopId }) => {
      const name = stopNames.get(stopId)
      if (!name || raw.stations[sourceIndex]?.name !== name) throw new Error('Source station/visit mismatch')
      return name
    })
    return { id: route.id, name: route.name, sequence, sourceSequence: raw.stations.map(({ name }) => name), warnings: route.warnings }
  })
  const matrix = rankCrossRoutes(historicalRoutes, currents)
  const sensitivity = [0, .5, 1].map((alpha) => ({ uncertainWeight: alpha, rows: rankCrossRoutes(historicalRoutes, currents, alpha).map((row) => ({
    historicalRouteNumber: row.historicalRouteNumber, bestCandidateIds: row.bestCandidateIds, topMargin: row.topMargin,
    ranking: row.candidates.map(({ currentRouteId, currentRouteName, score }) => ({ currentRouteId, currentRouteName, score })),
  })) }))
  const recommendations = matrix.map((row) => {
    const scenarioWinners = unique(sensitivity.flatMap(({ rows }) => rows.find(({ historicalRouteNumber }) => historicalRouteNumber === row.historicalRouteNumber)!.bestCandidateIds))
    const candidates = unique([...scenarioWinners, ...(row.topMargin !== null && row.topMargin < 2 ? row.candidates.slice(0, 2).map(({ currentRouteId }) => currentRouteId) : [])])
    return { historicalRouteNumber: row.historicalRouteNumber, defaultBestCandidateIds: row.bestCandidateIds,
      candidateIds: candidates, variesAcrossUncertainWeight: scenarioWinners.length > 1,
      classification: candidates.length === 0 ? 'no_positive_match' : candidates.length > 1 ? 'ambiguous_candidates' : 'same_winner_in_tested_scenarios' }
  })
  return {
    schemaVersion: 1, generatedOn: '2026-11-14', historicalYear: 2024, currentObservedAt: source.observedAt,
    oldRouteCount: historicalRoutes.length, currentRouteCount: currents.length, pairCount: historicalRoutes.length * currents.length,
    historicalRows: historicalRoutes.map(({ historicalRouteNumber, historicalRowLabels }) => ({
      historicalRouteNumber, rawLabels: [...historicalRowLabels], normalizedUniqueLandmarks: unique(historicalRowLabels.map(landmark)),
    })),
    currentSource: paths.map((path, i) => ({ path, sha256: createHash('sha256').update(bytes[i]).digest('hex') })),
    currentRoutes: currents,
    method: {
      identity: 'All old rows versus all current routes. Route IDs/numbers are not used to score or force a one-to-one correspondence. Old 9 is compared too.',
      vocabulary: unique(historicalRoutes.flatMap(({ historicalRowLabels }) => historicalRowLabels.map(landmark))),
      semantics: 'Reviewed aliases from compare-historical-routes; additionally 中图=中心图书馆, and compound components 中心图书馆地科院→中心图书馆 / 8教李园→李园. Neither makes a compound an identical stop.',
      dice: 'Current labels are projected onto the union of historical landmark keys. Each current key takes its strongest match: confirmed=1, compound/area=alpha. Dice=2*sum(current weights for old keys)/(old unique key count + sum(all current pooled weights)). Extra comparable corridors are penalized. Unrecognized fine current labels are disclosed but unassessed.',
      order: 'Weighted LCS of first-occurrence unique old keys against all actual geometry-visit labels, divided by ALL unique old keys. Each current position can be consumed once. No cyclic rotation, inferred closing edge, or source-array substitution.',
      endpoints: 'Mean match weight for first/last RAW old labels versus first/last geometry-reference labels. Repeated old endpoints remain repeated; these are not proven operating terminals.',
      score: '0–100 heuristic: 60% landmark Dice + 30% order coverage + 10% reference endpoint agreement. Compute both complete orientations and choose their maximum; order and endpoints must use the same orientation. Not an accuracy percentage or probability.',
      uncertainty: 'Default alpha=.5, repeat with 0 and 1. Report every scenario winner and default runner-up when the margin is under 2 points; this is a declared sensitivity rule, not a confidence interval.',
      limitations: 'Coarse old landmarks cannot measure every detour or physical overlap. Similarity does not establish a rename, replacement, closure, stop coordinate identity, or current operating direction. No routing data is changed.',
    },
    recommendations, sensitivity, matrix,
  }
}

if (process.argv[1] && /compare-cross-routes\.(ts|js)$/.test(process.argv[1])) {
  const report = buildCrossRouteReport(), output = process.argv.indexOf('--out')
  if (output >= 0 && !process.argv[output + 1]) throw new Error('--out requires a filename')
  const text = JSON.stringify(report, null, 2) + '\n'
  if (output >= 0) writeFileSync(resolve(process.argv[output + 1]), text, 'utf8')
  else process.stdout.write(text)
}
