import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

function runtime() {
  const module = { exports: {} as Record<string, (...args: any[]) => unknown> }
  runInNewContext(readFileSync(new URL('../miniprogram/pages/journey/sheet-gesture.wxs', import.meta.url), 'utf8'), { module, Math })
  const styles = new Map<string, Record<string, string>>()
  const calls: { name: string; value: { snap: string; epoch: number } }[] = []
  const owner = { selectComponent(selector: string) { return { setStyle(style: Record<string, string>) { styles.set(selector, { ...styles.get(selector), ...style }) } } },
    callMethod(name: string, value: { snap: string; epoch: number }) { calls.push({ name, value }) } }
  const geometry = { y: 450, expanded: 76, half: 300, peek: 450, epoch: 1, windowHeight: 667, footerGap: 28, headerHeight: 60 }
  const event = (y: number, time: number, count = 1) => ({ touches: Array.from({ length: count }, () => ({ pageY: y, clientY: y })), changedTouches: [{ pageY: y, clientY: y }], timeStamp: time })
  module.exports.sync(geometry, null, owner)
  return { api: module.exports, owner, styles, calls, geometry, event }
}

test('sheet drag updates render styles without crossing JS bridge until one settled snap', () => {
  const r = runtime()
  r.api.start(r.event(500, 0), r.owner)
  for (let y = 490; y >= 350; y -= 10) r.api.move(r.event(y, 400), r.owner)
  assert.equal(r.calls.length, 0)
  assert.match(r.styles.get('.glass-sheet')!.transform, /300px/)
  r.api.end(r.event(350, 700), r.owner)
  assert.equal(r.calls.length, 1)
  assert.equal(r.calls[0].name, 'handleSheetGestureEnd')
  assert.equal(r.calls[0].value.snap, 'half')
  assert.equal(r.calls[0].value.epoch, 1)
})

test('drag bounds, returning to the same snap and cancel all restore visible geometry', () => {
  const r = runtime()
  r.api.start(r.event(500, 0), r.owner)
  r.api.move(r.event(-5000, 400), r.owner)
  assert.match(r.styles.get('.glass-sheet')!.transform, /76px/)
  r.api.cancel(r.event(-5000, 500), r.owner)
  assert.match(r.styles.get('.glass-sheet')!.transform, /450px/)
  assert.equal(r.calls.length, 0)
  r.api.start(r.event(500, 600), r.owner)
  r.api.move(r.event(498, 650), r.owner)
  r.api.end(r.event(498, 700), r.owner)
  assert.match(r.styles.get('.glass-sheet')!.transform, /450px/)
  r.api.start(r.event(500, 1000), r.owner)
  r.api.move(r.event(480, 1500), r.owner)
  r.api.end(r.event(480, 1800), r.owner)
  assert.match(r.styles.get('.glass-sheet')!.transform, /450px/)
  assert.equal(r.calls[0].value.snap, 'peek')
})

test('programmatic sheet changes invalidate old gestures and multi-touch does not move the sheet', () => {
  const r = runtime()
  r.api.start(r.event(500, 0), r.owner)
  r.api.move(r.event(400, 400), r.owner)
  r.api.sync({ ...r.geometry, y: 76, epoch: 2 }, r.geometry, r.owner)
  r.api.end(r.event(350, 800), r.owner)
  assert.equal(r.calls.length, 0)
  assert.match(r.styles.get('.glass-sheet')!.transform, /76px/)
  r.api.start(r.event(500, 1000, 2), r.owner)
  r.api.move(r.event(600, 1200, 2), r.owner)
  r.api.end(r.event(600, 1500, 2), r.owner)
  assert.equal(r.calls.length, 0)
})

test('adding a second finger during a drag restores the last settled sheet instead of freezing midway', () => {
  const r = runtime()
  r.api.start(r.event(500, 0), r.owner)
  r.api.move(r.event(400, 200), r.owner)
  r.api.start(r.event(400, 220, 2), r.owner)
  r.api.end(r.event(400, 400, 2), r.owner)
  assert.match(r.styles.get('.glass-sheet')!.transform, /450px/)
  assert.equal(r.calls.length, 0)
})
