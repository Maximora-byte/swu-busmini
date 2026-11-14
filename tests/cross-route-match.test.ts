import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCrossRouteReport, rankCrossRoutes, scoreCrossRoutePair } from '../scripts/compare-cross-routes'

const old = (number: number, labels: string[]) => ({ historicalRouteNumber: number, historicalRowLabels: labels, currentRouteId: null })
const current = (id: string, sequence: string[]) => ({ id, name: id, sequence, sourceSequence: sequence, warnings: [] })

test('every old line is compared with every current line without a route-number bonus', () => {
  const rows = rankCrossRoutes([old(1, ['甲', '乙', '丙'])], [current('route_1', ['甲', '丁', '戊']), current('route_7', ['甲', '乙', '丙'])], .5)
  assert.equal(rows[0].candidates.length, 2)
  assert.equal(rows[0].candidates[0].currentRouteId, 'route_7')
  assert.equal(rows[0].candidates[0].score, 100)
})

test('extra comparable corridors are penalized while unassessed fine labels are disclosed', () => {
  const histories = [old(1, ['甲', '乙']), old(2, ['丁'])]
  const rows = rankCrossRoutes(histories, [current('long', ['甲', '乙', '丁']), current('direct', ['甲', '细分教学楼', '乙'])], .5)
  assert.equal(rows[0].candidates[0].currentRouteId, 'direct')
  assert.equal(rows[0].candidates[0].score, 100)
  assert.deepEqual(rows[0].candidates[0].unassessedCurrentLabels, ['细分教学楼'])
})

test('few matching landmarks cannot obtain a complete score from matched-only ordering', () => {
  const row = rankCrossRoutes([old(1, ['甲', '乙', '丙', '丁'])], [current('short', ['甲'])], .5)[0]
  assert.equal(row.candidates[0].components.orderCoverage, 25)
  assert.ok(row.candidates[0].score < 50)
})

test('order and reference endpoints use the same orientation rather than independently picking maxima', () => {
  const h = old(1, ['甲', '乙', '丙', '丁'])
  const result = scoreCrossRoutePair(h, current('rotated', ['丁', '甲', '乙', '丙']), ['甲', '乙', '丙', '丁'], .5)
  assert.equal(result.referenceOrientation, 'forward')
  assert.equal(result.score, 82.5)
  assert.equal(result.components.endpointAgreement, 0)
})

test('repeated old endpoints remain structural evidence without adding a current closing edge', () => {
  const row = rankCrossRoutes([old(6, ['甲', '乙', '丙', '甲'])], [current('open', ['甲', '乙', '丙'])], .5)[0]
  assert.equal(row.candidates[0].historicalUniqueLandmarkCount, 3)
  assert.equal(row.candidates[0].historicalRepeatedEndpoint, true)
  assert.equal(row.candidates[0].score, 95)
})

test('compound and area assumptions are explicitly varied and cannot create forbidden identities', () => {
  const h = old(3, ['竹园', '梅园'])
  const c = current('area', ['后山竹园', '梅园1舍'])
  assert.equal(scoreCrossRoutePair(h, c, ['竹园', '梅园'], 0).score, 0)
  assert.equal(scoreCrossRoutePair(h, c, ['竹园', '梅园'], .5).score, 60)
  assert.equal(scoreCrossRoutePair(h, c, ['竹园', '梅园'], 1).score, 100)
  assert.equal(scoreCrossRoutePair(old(1, ['六号门']), current('wrong', ['资环院', '32教']), ['六号门'], 1).score, 0)
})

test('identical candidates remain tied and route IDs cannot break a semantic tie', () => {
  const row = rankCrossRoutes([old(9, ['甲', '乙'])], [current('one', ['甲', '乙']), current('two', ['甲', '乙'])], .5)[0]
  assert.deepEqual(row.bestCandidateIds, ['one', 'two'])
  assert.equal(row.topMargin, 0)
})

test('reviewed short names normalize consistently on either side of a comparison', () => {
  const h = old(9, ['中图', '八教'])
  assert.equal(scoreCrossRoutePair(h, current('full', ['中心图书馆', '8教学楼']), ['中图', '八教'], .5).score, 100)
  assert.equal(scoreCrossRoutePair(h, current('short', ['中图', '八教']), ['中图', '八教'], .5).score, 100)
})

test('the real report includes all 90 pairs and compares old 9 instead of forcing N/A', () => {
  const report = buildCrossRouteReport()
  assert.equal(report.matrix.length, 9)
  assert.ok(report.matrix.every((row) => row.candidates.length === 10))
  assert.equal(report.matrix.find((row) => row.historicalRouteNumber === 9)!.candidates.length, 10)
  assert.equal(report.sensitivity.length, 3)
  assert.ok(report.sensitivity.every((scenario) => scenario.rows.length === 9))
})
