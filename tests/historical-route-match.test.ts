import assert from 'node:assert/strict'
import test from 'node:test'
import { compareHistoricalRoute, type CurrentRouteLabels } from '../scripts/compare-historical-routes'

function compare(old: string[], names: string[], visits = names) {
  const remaining = names.map((name, index) => ({ name, index }))
  const current: CurrentRouteLabels = {
    id: 'fixture', sourceStationNames: names, geometryVisitNames: visits,
    visitSourceIndices: visits.map((name) => {
      const index = remaining.findIndex((entry) => entry.name === name)
      return remaining.splice(index, 1)[0].index
    }), warnings: [],
  }
  return compareHistoricalRoute({ historicalRouteNumber: 1, historicalRowLabels: old, currentRouteId: 'fixture' }, current)
}

test('identical landmarks have complete coverage and forward order; reverse is separate', () => {
  const result = compare(['甲', '乙', '丙'], ['甲', '乙', '丙'])
  assert.deepEqual(result.confirmedCoverage, { numerator: 3, denominator: 3, percent: 100 })
  assert.equal(result.order?.confirmed.geometry.forward.numerator, 3)
  assert.equal(result.order?.confirmed.geometry.reverse.numerator, 1)
})

test('reversed geometry does not get relabelled as a forward operational route', () => {
  const result = compare(['甲', '乙', '丙'], ['甲', '乙', '丙'], ['丙', '乙', '甲'])
  assert.equal(result.order?.confirmed.geometry.forward.percent, 33.33)
  assert.equal(result.order?.confirmed.geometry.reverse.percent, 100)
  assert.equal(result.order?.confirmed.sourceArray.forward.percent, 100)
})

test('partial coverage uses all unique historical landmarks, while order uses only matches', () => {
  const result = compare(['甲', '乙', '丙', '丁'], ['甲', '丙', '新增'])
  assert.deepEqual(result.confirmedCoverage, { numerator: 2, denominator: 4, percent: 50 })
  assert.deepEqual(result.unmatchedHistoricalLabels, ['乙', '丁'])
  assert.deepEqual(result.order?.confirmed.geometry.forward, { numerator: 2, denominator: 2, percent: 100 })
})

test('historical repeats do not inflate coverage, duplicate candidates and unmatched labels stay visible', () => {
  const result = compare(['二号门', '甲', '二号门', '失配', '甲'], ['2号门', '甲', '2号门'])
  assert.equal(result.historicalRawLabelCount, 5)
  assert.equal(result.historicalUniqueLabelCount, 3)
  assert.equal(result.confirmedCoverage?.percent, 66.67)
  assert.equal(result.matches[0].candidates.length, 2)
  assert.equal(result.order?.confirmed.ambiguousHistoricalLabels[0], '二号门')
  assert.deepEqual(result.unmatchedHistoricalLabels, ['失配'])
})

test('only explicitly reviewed numeric and historical building synonyms count as confirmed', () => {
  const result = compare(['二号门', '八教', '二十六教', '五教', '外语学院'], ['2号门', '8教学楼', '26教', '外国语学院'])
  assert.equal(result.historicalUniqueLabelCount, 4)
  assert.equal(result.confirmedCoverage?.percent, 100)
  assert.match(result.matches[3].candidates[0].reason, /2024.*#5/)
})

test('compound and area matches are upper-bound coverage, not confirmed stop equivalence', () => {
  const result = compare(['二号门', '八教', '竹园', '梅园', '地科院'], ['共青花园2号门', '8教李园', '后山竹园', '梅园1舍', '中心图书馆地科院'])
  assert.equal(result.confirmedCoverage?.percent, 0)
  assert.equal(result.plausibleCoverageUpperBound?.percent, 100)
  assert.equal(result.order?.confirmed.geometry.forward.percent, null)
  assert.equal(result.matches[1].candidates[0].kind, 'composite_or_area')
})

test('nearby gates, cafeterias, buildings and Li garden are never silently substituted', () => {
  const result = compare(['六号门', '二食堂', '二十六教', '李园'], ['资环院', '32教', '楠园', '药学院', '八教'])
  assert.equal(result.plausibleCoverageUpperBound?.percent, 0)
  assert.deepEqual(result.unmatchedHistoricalLabels, ['六号门', '二食堂', '二十六教', '李园'])
})

test('historical closed rows are neither rotated nor closed to improve order scores', () => {
  const result = compare(['甲', '乙', '丙', '甲'], ['乙', '丙', '甲'])
  assert.equal(result.order?.confirmed.geometry.forward.percent, 66.67)
})

test('missing current route is not a zero coverage claim or evidence of withdrawal', () => {
  const result = compareHistoricalRoute({ historicalRouteNumber: 9, historicalRowLabels: ['竹园'], currentRouteId: null }, null)
  assert.equal(result.status, 'no_current_catalog_counterpart')
  assert.equal(result.confirmedCoverage, null)
  assert.equal(result.order, null)
})
