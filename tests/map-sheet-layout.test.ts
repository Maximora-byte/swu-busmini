import assert from 'node:assert/strict'
import test from 'node:test'
import { createSheetLayout, getSheetGeometry, getOverlayMapPadding } from '../miniprogram/services/map/map-sheet-layout'

test('three sheet positions keep scroll controls above the copyright and safe-area gap', () => {
  const layout = createSheetLayout({ windowWidth: 390, windowHeight: 756, screenHeight: 844, safeArea: { bottom: 810 } })
  assert.ok(layout.expanded < layout.half && layout.half < layout.peek)
  for (const snap of ['peek', 'half', 'full'] as const) {
    const g = getSheetGeometry(layout, snap, 1)
    assert.ok(g.height > g.headerHeight)
    assert.ok(g.y + g.height <= 756 - 34 - 24)
    assert.equal(g.scrollHeight, g.height - g.headerHeight)
  }
})

test('invalid metrics have a finite usable fallback and compact windows remain bounded', () => {
  for (const height of [NaN, Infinity, -1, 320, 480, 667]) {
    const layout = createSheetLayout({ windowWidth: 0, windowHeight: height })
    const g = getSheetGeometry(layout, 'peek', 0)
    assert.ok(Number.isFinite(g.y) && Number.isFinite(g.scrollHeight))
    assert.ok(g.y >= 0 && g.y + g.height <= layout.height)
    assert.ok(g.scrollHeight > 0)
  }
  const small = createSheetLayout({ windowWidth: 320, windowHeight: 480 })
  const compact = getSheetGeometry(small, 'peek', 0)
  assert.ok(compact.scrollHeight >= 76, 'compact peek keeps its single route summary accessible')
  assert.ok(getOverlayMapPadding(320, 480, small, compact), 'compact peek leaves enough map space to fit the route')
})

test('map padding excludes search chrome and the settled sheet; full sheet postpones fitting', () => {
  const layout = createSheetLayout({ windowWidth: 375, windowHeight: 667 })
  const peek = getSheetGeometry(layout, 'peek', 1)
  const a = getOverlayMapPadding(375, 667, layout, peek)!
  assert.ok(a[0] >= 140, 'labels must clear the search bar and their native icon height')
  assert.ok(a[1] >= 80 && a[3] >= 80, 'callouts must not clip against side edges')
  assert.ok(a[2] >= 667 - peek.y)
  const short = createSheetLayout({ windowWidth: 375, windowHeight: 599 })
  assert.equal(getOverlayMapPadding(375, 599, short, getSheetGeometry(short, 'half', 2)), null)
  const large = createSheetLayout({ windowWidth: 375, windowHeight: 900 })
  const b = getOverlayMapPadding(375, 900, large, getSheetGeometry(large, 'half', 2))!
  const c = getOverlayMapPadding(375, 900, large, getSheetGeometry(large, 'peek', 2))!
  assert.ok(b[2] > c[2])
  assert.ok(a[0] + a[2] < 667 && b[0] + b[2] < 900)
  assert.equal(getOverlayMapPadding(375, 667, layout, getSheetGeometry(layout, 'full', 3)), null)
  assert.equal(getOverlayMapPadding(0, 0, layout, peek), null)
})
