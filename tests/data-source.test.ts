import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import sources from '../miniprogram/data/sources.json'
import routes from '../miniprogram/data/routes.json'

test('records the 2025 map scope and verification warning', () => {
  assert.equal(sources.sources.length, 1)
  assert.equal(
    sources.sources[0]?.title,
    '西南大学北碚校区校园地图（2025）',
  )
  assert.match(sources.sources[0]?.usage ?? '', /不用于 GPS 坐标/)
  assert.match(sources.sources[0]?.status ?? '', /2026 年/)
})

test('assigns source and review status to every route', () => {
  assert.deepEqual(
    sources.routeSources.map(({ routeId }) => routeId),
    routes.map(({ id }) => id),
  )
  for (const assignment of sources.routeSources) {
    assert.equal(assignment.source, 'swu_beibei_campus_map_2025')
    assert.equal(assignment.status, 'needs_review')
  }
})
