import assert from 'node:assert/strict'
import test from 'node:test'
import { currentTransitDataset } from '../miniprogram/data/current-transit'
import { getUnifiedTransitStops } from '../miniprogram/services/map/unified-transit-stops'

test('unified stations preserve every source stop and visit without changing the dataset', () => {
  const before = JSON.stringify(currentTransitDataset)
  const groups = getUnifiedTransitStops(currentTransitDataset)
  assert.ok(groups.length < currentTransitDataset.stops.length)
  assert.equal(new Set(groups.flatMap((group) => group.stopIds)).size, currentTransitDataset.stops.length)
  assert.equal(groups.flatMap((group) => group.routes.flatMap((route) => route.visits)).length, 162)
  for (const group of groups) assert.ok(currentTransitDataset.stops.some((stop) => group.stopIds.includes(stop.id) &&
    JSON.stringify(stop.coordinate) === JSON.stringify(group.coordinate)))
  groups[0].coordinate.latitude = 0
  assert.equal(JSON.stringify(currentTransitDataset), before)
})

test('same-name grouping uses complete distance bounds, separates other names and distant platforms', () => {
  const data = structuredClone(currentTransitDataset)
  data.routes = []
  data.stops = [0, 0.0005, 0.001, 0.002].map((delta, i) => ({ id: `s${i}`, name: '同站', coordinate: { latitude: 29.82 + delta, longitude: 106.42 } }))
  data.stops.push({ ...data.stops[0], id: 'other', name: '另一站' })
  const groups = getUnifiedTransitStops(data)
  assert.equal(groups.length, 4)
  assert.deepEqual(groups[0].stopIds, ['s0', 's1'])
  assert.ok(groups.filter((group) => group.name === '同站').every((group) => group.label.includes('站区')))
})

test('grouping retains route-scoped quarantine and repeated source occurrences', () => {
  const data = structuredClone(currentTransitDataset)
  const route = data.routes.find((route) => route.id === 'route_3b')!
  const suspect = route.visits.find((visit) => visit.offsetMeters > 35)!
  route.visits.push({ ...route.visits[0] })
  const groups = getUnifiedTransitStops(data)
  const group = groups.find((group) => group.stopIds.includes(suspect.stopId))!
  assert.equal(group.routes.find((line) => line.routeId === 'route_3b')!.visits.find((visit) => visit.stopId === suspect.stopId)!.canBoard, false)
  assert.equal(group.routes.find((line) => line.routeId === 'route_3')!.visits.find((visit) => visit.stopId === suspect.stopId)!.canBoard, true)
  const visits = groups.flatMap((group) => group.routes.filter((line) => line.routeId === route.id).flatMap((line) => line.visits))
  assert.equal(new Set(visits.map((visit) => visit.key)).size, route.visits.length)
})
