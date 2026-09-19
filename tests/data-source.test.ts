import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import sources from '../miniprogram/data/sources.json'

test('records the 2025 map scope and verification warning', () => {
  assert.equal(sources.length, 1)
  assert.equal(sources[0]?.title, '西南大学北碚校区校园地图（2025）')
  assert.match(sources[0]?.usage ?? '', /不用于 GPS 坐标/)
  assert.match(sources[0]?.status ?? '', /2026 年/)
})
