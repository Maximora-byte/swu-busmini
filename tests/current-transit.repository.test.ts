import assert from 'node:assert/strict'
import test from 'node:test'
import type { TransitDataset } from '../miniprogram/models/current-transit'
import { createCurrentTransitRepository as create, currentTransitRepository as published } from '../miniprogram/services/repository/current-transit.repository'

test('current dataset contains ten exact lines, 162 station visits and all original geometry points', async () => {
  const repository = published
  const dataset: TransitDataset = repository.getDataset()
  assert.deepEqual(dataset.routes.map(({ id }) => id), ['route_1', 'route_2', 'route_3', 'route_3b', 'route_4', 'route_5', 'route_6', 'route_7', 'route_8', 'route_jingguan'])
  assert.deepEqual(dataset.routes.map(({ points }) => points.length), [79, 80, 103, 88, 61, 55, 69, 71, 55, 21])
  assert.deepEqual(dataset.routes.map(({ visits }) => visits.length), [16, 15, 22, 19, 15, 13, 22, 20, 15, 5])
  assert.equal(dataset.routes.flatMap(({ visits }) => visits).length, 162)
  assert.equal(repository.getRoute('route_9'), undefined)
  assert.equal(repository.getRoute('toString'), undefined)
  assert.equal(repository.getStop('missing'), undefined)
  for (const route of dataset.routes) {
    for (let index = 1; index < route.visits.length; index++) {
      assert.ok(route.visits[index - 1].mileageMeters <= route.visits[index].mileageMeters)
    }
  }
})

test('repository deep copies input, datasets, route geometry, visits, warnings and stop coordinates', async () => {
  const original: TransitDataset = published.getDataset()
  const input = published.getDataset()
  const repository = create(input)
  input.routes[0].points[0].latitude = 0
  input.stops[0].coordinate.latitude = 0
  const output = repository.getDataset()
  output.routes[0].visits[0].stopId = 'mutated'
  output.routes[0].warnings.push('mutated')
  output.stops.splice(0)
  repository.getRoute(original.routes[0].id)!.points[0].longitude = 0
  repository.getStop(original.stops[0].id)!.coordinate.longitude = 0
  assert.deepEqual(repository.getDataset(), original)
})

test('repository rejects malformed records, foreign points, wrong quality and unknown private keys', async () => {
  for (const invalid of [null, [], {}, 'dataset']) assert.throws(() => create(invalid))
  for (const mutate of [
    (d: any) => { d.quality = 'verified' },
    (d: any) => { d.coordinateSystem = 'WGS84' },
    (d: any) => { d.observedAt = '2026-02-30' },
    (d: any) => { d.routes[0].points[0].latitude = 39.9 },
    (d: any) => { d.routes[0].visits[0].stopId = 'unknown' },
    (d: any) => { d.stops[0].account = 'private' },
    (d: any) => { d.routes[0].providerId = 'private' },
    (d: any) => { d.routes[0].color = 'bad' },
    (d: any) => { d.routes[0].points = [] },
    (d: any) => { d.routes[0].visits = [] },
    (d: any) => { d.routes[0].warnings = [3] },
    (d: any) => { d.source = '' },
  ]) { const input = published.getDataset(); mutate(input); assert.throws(() => create(input)) }
})

test('repository rejects duplicate IDs, missing visits, invalid anchor positions and unsorted mileage', async () => {
  for (const mutate of [
    (d: any) => d.routes.push(d.routes[0]),
    (d: any) => d.stops.push(d.stops[0]),
    (d: any) => { d.routes[0].visits[1].sourceIndex = d.routes[0].visits[0].sourceIndex },
    (d: any) => { d.routes[0].visits[0].segmentIndex = -1 },
    (d: any) => { d.routes[0].visits[0].segmentIndex = d.routes[0].points.length - 1 },
    (d: any) => { d.routes[0].visits[0].ratio = 2 },
    (d: any) => { d.routes[0].visits[0].mileageMeters += 10 },
    (d: any) => { d.routes[0].visits[0].offsetMeters += 10 },
    (d: any) => { d.routes[0].visits[0].offsetMeters = 151 },
    (d: any) => { d.routes[0].visits.reverse() },
  ]) { const input = published.getDataset(); mutate(input); assert.throws(() => create(input)) }
})
