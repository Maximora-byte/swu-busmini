import assert from 'node:assert/strict'
import test from 'node:test'
import { navigationPlannerService } from '../miniprogram/services/navigation/navigation-planner.service'
import { poiRepository } from '../miniprogram/services/repository/poi.repository'

test('central library aliases resolve to the user-confirmed zhongtu stop and route 9', () => {
  for (const keyword of ['中图', '中心图书馆', '图书馆']) {
    assert.equal(poiRepository.search(keyword)[0]?.id, 'library')
  }
  const result = navigationPlannerService.plan(undefined, 'poi:library')
  assert.equal(result.plans.length, 2)
  assert.ok(result.plans.every((plan) => plan.routeId === 'route_9' && plan.destinationText === '中心图书馆'))
})

test('gate 5 to central library matches the correct onward direction and ordered reference stops', () => {
  const result = navigationPlannerService.plan('poi:gate_5', 'poi:library')
  assert.equal(result.plans.length, 1)
  assert.equal(result.plans[0].directionId, '图示顺序')
  assert.equal(result.plans[0].boardingText, '五号门')
  assert.equal(result.plans[0].pathText, '五号门 → 橘园 → 梅园 → 中心图书馆')
  const back = navigationPlannerService.plan('poi:library', 'poi:gate_5')
  assert.equal(back.plans[0].directionId, '图示逆序')
})

test('unknown, same place, missing relationship, and disconnected places are explicit', () => {
  assert.throws(() => navigationPlannerService.plan(undefined, 'missing'), /目的地/)
  assert.throws(() => navigationPlannerService.plan('missing', 'poi:library'), /起点/)
  assert.deepEqual(navigationPlannerService.plan('poi:library', 'poi:library').plans, [])
  assert.match(navigationPlannerService.plan('poi:student_dormitory', 'poi:library').message, /尚未确认/)
  assert.match(navigationPlannerService.plan('poi:canteen_2', 'poi:library').message, /未找到/)
})

test('place options have stable unique ids and expose named stops without duplicate library', () => {
  const places = navigationPlannerService.getPlaces()
  assert.equal(new Set(places.map(({ id }) => id)).size, places.length)
  assert.ok(places.some(({ id }) => id === 'stop:gate_2'))
  assert.equal(places.filter(({ name }) => name === '中心图书馆').length, 1)
})
