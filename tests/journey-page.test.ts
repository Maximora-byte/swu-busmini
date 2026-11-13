import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import type { Coordinate } from '../miniprogram/models/index'
import type { TransitDataset } from '../miniprogram/models/current-transit'
import type { TransitJourney } from '../miniprogram/services/navigation/transit-journey.service'

interface PageData {
  routeOptions: { id: string; name: string }[]
  selectedRouteId: string
  sourceText: string
  directionStatusText: string
  stopOptions: { id: string; label: string }[]
  originIndex: number
  destinationIndex: number
  originMode: string
  originCoordinate: Coordinate | null
  journeys: TransitJourney[]
  selectedJourneyId: string
  journeyMessage: string
  locationMessage: string
  locating: boolean
  mapPolylines: { points: Coordinate[] }[]
  mapMarkers: { stopId: string; latitude: number; longitude: number; callout: { content: string } }[]
}
interface Event { currentTarget: { dataset: { routeId?: string; journeyId?: string; legIndex?: number; pointKind?: string } } }
interface JourneyPage {
  data: PageData
  setData(update: Partial<PageData>, callback?: () => void): void
  onLoad(query?: { routeId?: string }): void
  onReady(): void
  onHide(): void
  onShow(): void
  handleRouteChange(event: Event): void
  handleOriginChange(event: { detail: { value: string } }): void
  handleDestinationChange(event: { detail: { value: string } }): void
  handlePlanJourney(): void
  handleShowJourney(event: Event): void
  handleOpenStop(event: Event): void
  handleUseLocation(): Promise<void>
}

function createRuntime(deferRendering = false, deferMapMeasurement = false) {
  const root = fileURLToPath(new URL('../miniprogram/', import.meta.url))
  const modules = new Map<string, { exports: unknown }>()
  const pendingRendering: (() => void)[] = []
  const pendingLocation: { success(result: Coordinate & { accuracy: number }): void; fail(error: { errMsg: string }): void }[] = []
  const fitPoints: Coordinate[][] = []
  const fitPadding: number[][] = []
  const pendingMapMeasurement: ((rect: { width: number; height: number }) => void)[] = []
  const openedStops: Coordinate[] = []
  let page: JourneyPage | undefined
  const wx = {
    createMapContext() {
      return { setBoundary() {}, includePoints(options: { points: Coordinate[]; padding: number[] }) {
        fitPoints.push(options.points)
        fitPadding.push(options.padding)
      } }
    },
    createSelectorQuery() {
      const query = {
        in() { return query }, select() { return query },
        boundingClientRect(callback: (rect: { width: number; height: number }) => void) {
          if (deferMapMeasurement) pendingMapMeasurement.push(callback)
          else callback({ width: 390, height: 294 })
          return query
        }, exec() {},
      }
      return query
    },
    getSetting(options: { success(result: { authSetting: Record<string, boolean> }): void }) {
      options.success({ authSetting: { 'scope.userLocation': true } })
    },
    getLocation(options: (typeof pendingLocation)[number]) { pendingLocation.push(options) },
    openLocation(options: Coordinate) { openedStops.push({ latitude: options.latitude, longitude: options.longitude }) },
    navigateTo() {},
  }
  function load(path: string): unknown {
    assert.ok(path.startsWith(root + sep) || path.startsWith(root))
    const cached = modules.get(path)
    if (cached) return cached.exports
    const source = readFileSync(path, 'utf8')
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: path,
    }).outputText
    const module = { exports: {} as unknown }
    modules.set(path, module)
    runInNewContext(code, {
      module, exports: module.exports, wx,
      require(specifier: string) {
        assert.ok(specifier.startsWith('.'), 'journey must use local JS-compatible modules')
        assert.ok(!specifier.endsWith('.json') && !specifier.includes('config.local'))
        return load(resolve(dirname(path), `${specifier}.ts`))
      },
      Page(configuration: JourneyPage) {
        page = Object.assign(configuration, {
          setData(this: JourneyPage, update: Partial<PageData>, callback?: () => void) {
            Object.assign(this.data, update)
            if (callback && deferRendering) pendingRendering.push(callback)
            else callback?.()
          },
        })
      },
    }, { filename: path, timeout: process.env.NODE_V8_COVERAGE ? 5000 : 1000 })
    return module.exports
  }
  return {
    fitPoints, fitPadding, openedStops,
    flushMapMeasurements(width = 390, height = 294) {
      pendingMapMeasurement.splice(0).forEach((callback) => callback({ width, height }))
    },
    page() {
      const path = resolve(root, 'pages/journey/journey.ts')
      assert.ok(existsSync(path), 'offline journey page must be implemented')
      load(path)
      assert.ok(page, 'journey Page must register')
      return page
    },
    dataset() {
      const repository = load(resolve(root, 'services/repository/current-transit.repository.ts')) as {
        currentTransitRepository: { getDataset(): TransitDataset }
      }
      return repository.currentTransitRepository.getDataset()
    },
    flushRendering() { pendingRendering.splice(0).forEach((callback) => callback()) },
    resolveLocation(coordinate: Coordinate) {
      assert.ok(pendingLocation.length)
      pendingLocation.shift()!.success({ ...coordinate, accuracy: 10 })
    },
    rejectLocation() {
      assert.ok(pendingLocation.length)
      pendingLocation.shift()!.fail({ errMsg: 'getLocation:fail permission denied' })
    },
  }
}

function selectStopPair(page: JourneyPage, dataset: TransitDataset) {
  const route = dataset.routes.find(({ id }) => id === 'route_1')!
  const from = route.visits[2].stopId
  const to = route.visits[10].stopId
  page.handleOriginChange({ detail: { value: String(page.data.stopOptions.findIndex(({ id }) => id === from)) } })
  page.handleDestinationChange({ detail: { value: String(page.data.stopOptions.findIndex(({ id }) => id === to)) } })
  return { from, to, route }
}

test('new default journey entry shows ten operator routes and published geometry without a network API', () => {
  const app = JSON.parse(readFileSync(fileURLToPath(new URL('../miniprogram/app.json', import.meta.url)), 'utf8'))
  assert.equal(app.pages[0], 'pages/journey/journey')
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  assert.equal(page.data.routeOptions.length, 10)
  assert.ok(!page.data.routeOptions.some(({ id }) => id === 'route_9'))
  assert.ok(page.data.routeOptions.some(({ id }) => id === 'route_3b'))
  assert.match(page.data.sourceText, /享坐车.*2026-11-13/)
  assert.ok(page.data.stopOptions.length > 40)
  assert.equal(runtime.fitPoints.length, 0, 'native map must be ready before camera requests')
  page.onReady()
  assert.ok(runtime.fitPoints.length > 0)
  const route = runtime.dataset().routes.find(({ id }) => id === page.data.selectedRouteId)!
  assert.equal(JSON.stringify(page.data.mapPolylines[0].points), JSON.stringify(route.points))
})

test('a delayed map measurement cannot restore the previous route or move a hidden page', () => {
  const runtime = createRuntime(false, true)
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_4' } } })
  assert.equal(runtime.fitPoints.length, 0, 'fit must wait for the actual map dimensions')
  runtime.flushMapMeasurements()
  assert.equal(runtime.fitPoints.length, 1)
  assert.equal(JSON.stringify(runtime.fitPoints[0]), JSON.stringify(page.data.mapPolylines[0].points))
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_2' } } })
  page.onHide()
  runtime.flushMapMeasurements()
  assert.equal(runtime.fitPoints.length, 1, 'a hidden page must not receive a delayed camera update')
})

test('fitting a compact map leaves a usable viewport after reserving marker label space', () => {
  const runtime = createRuntime(false, true)
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  runtime.flushMapMeasurements(280, 100)
  const [top, right, bottom, left] = runtime.fitPadding[0]
  assert.ok(top > bottom, 'above-marker callouts need more space than the bottom edge')
  assert.ok(top + bottom < 100)
  assert.ok(left + right < 280)
})

test('a station journey displays the actual riding segment and opens only a published stop coordinate', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  const pair = selectStopPair(page, runtime.dataset())
  page.handlePlanJourney()
  assert.ok(page.data.journeys.length)
  const journey = page.data.journeys.find((item) => item.legs.length === 1 && item.legs[0].routeId === 'route_1')!
  assert.ok(journey)
  page.handleShowJourney({ currentTarget: { dataset: { journeyId: journey.id } } })
  assert.equal(page.data.selectedJourneyId, journey.id)
  assert.ok(page.data.mapPolylines[0].points.length < pair.route.points.length)
  assert.ok(page.data.mapMarkers.some(({ stopId }) => stopId === pair.from))
  assert.ok(page.data.mapMarkers.some(({ stopId }) => stopId === pair.to))
  page.handleOpenStop({ currentTarget: { dataset: { journeyId: journey.id, legIndex: 0, pointKind: 'boarding' } } })
  const stop = runtime.dataset().stops.find(({ id }) => id === pair.from)!
  assert.equal(runtime.openedStops.length, 1)
  assert.equal(runtime.openedStops[0].latitude, stop.coordinate.latitude)
  assert.equal(runtime.openedStops[0].longitude, stop.coordinate.longitude)
  page.handleOpenStop({ currentTarget: { dataset: { journeyId: 'unknown', legIndex: 0, pointKind: 'boarding' } } })
  assert.equal(runtime.openedStops.length, 1)
})

test('changing endpoints clears stale journeys while invalid selections preserve the current map', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad({ routeId: 'route_3b' })
  page.onReady()
  assert.equal(page.data.selectedRouteId, 'route_3b')
  selectStopPair(page, runtime.dataset())
  page.handlePlanJourney()
  const before = JSON.stringify(page.data.mapPolylines)
  page.handleShowJourney({ currentTarget: { dataset: { journeyId: 'unknown' } } })
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_9' } } })
  assert.equal(JSON.stringify(page.data.mapPolylines), before)
  page.handleDestinationChange({ detail: { value: '0' } })
  assert.equal(page.data.journeys.length, 0)
  assert.equal(page.data.selectedJourneyId, '')
  page.handleOriginChange({ detail: { value: '-1' } })
  assert.ok(page.data.originIndex >= 0)
})

test('location selection is optional and a stale result cannot replace a newly chosen station', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  const locating = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.handleOriginChange({ detail: { value: '2' } })
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await locating
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.originCoordinate, null)
  assert.equal(page.data.originIndex, 2)
  const retry = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.rejectLocation()
  await retry
  assert.equal(page.data.originMode, 'stop')
  assert.ok(page.data.locationMessage.length > 0)
  selectStopPair(page, runtime.dataset())
  page.handlePlanJourney()
  assert.ok(page.data.journeys.length)
})

test('latest route wins delayed camera updates and hidden pages do not fit geometry', () => {
  const runtime = createRuntime(true)
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  runtime.flushRendering()
  const before = runtime.fitPoints.length
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_2' } } })
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_3b' } } })
  runtime.flushRendering()
  assert.equal(runtime.fitPoints.length, before + 1)
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_4' } } })
  page.onHide()
  runtime.flushRendering()
  assert.equal(runtime.fitPoints.length, before + 1)
})

test('a valid current location produces nearby boarding candidates and a distant fix produces no recommendation', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad({ routeId: 'not-current' })
  const dataset = runtime.dataset()
  const route = dataset.routes.find(({ id }) => id === 'route_4')!
  const from = dataset.stops.find(({ id }) => id === route.visits[0].stopId)!
  const to = route.visits[route.visits.length - 1].stopId
  page.handleDestinationChange({ detail: { value: String(page.data.stopOptions.findIndex(({ id }) => id === to)) } })
  const nearby = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.resolveLocation(from.coordinate)
  await nearby
  assert.equal(page.data.originMode, 'coordinate')
  page.handlePlanJourney()
  assert.ok(page.data.journeys.length)
  assert.ok(page.data.journeys.some((journey) => journey.legs[0].boardingStopId === from.id))
  const distant = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.resolveLocation({ latitude: 31.23, longitude: 121.47 })
  await distant
  page.handlePlanJourney()
  assert.equal(page.data.journeys.length, 0)
  assert.ok(page.data.journeyMessage.length > 0)
})

test('a hidden page discards a pending location instead of resurrecting old origin state on return', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  const locating = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.onHide()
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await locating
  page.onShow()
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.originCoordinate, null)
})

test('a failed location refresh cannot silently reuse a previous successful GPS fix', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  const first = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await first
  assert.equal(page.data.originMode, 'coordinate')
  const retry = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(page.data.originCoordinate, null, 'refresh must invalidate the old fix before completion')
  runtime.rejectLocation()
  await retry
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.originCoordinate, null)
  assert.equal(page.data.locating, false)
})

test('refreshing location then hiding or changing destination leaves no old fix or pending status', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  const first = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await first
  const refresh = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.onHide()
  runtime.resolveLocation({ latitude: 29.821, longitude: 106.421 })
  await refresh
  page.onShow()
  assert.equal(page.data.originCoordinate, null)
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.locating, false)
  assert.doesNotMatch(page.data.locationMessage, /正在定位/)
  const pending = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.handleDestinationChange({ detail: { value: '3' } })
  runtime.resolveLocation({ latitude: 29.822, longitude: 106.422 })
  await pending
  assert.equal(page.data.originCoordinate, null)
  assert.doesNotMatch(page.data.locationMessage, /正在定位/)
})

test('an off-route source point stays visible for review without advertising that line as boardable', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad({ routeId: 'route_3b' })
  const dataset = runtime.dataset()
  const route = dataset.routes.find(({ id }) => id === 'route_3b')!
  const suspect = route.visits.find(({ offsetMeters }) => offsetMeters > 35)!
  const stop = dataset.stops.find(({ id }) => id === suspect.stopId)!
  const marker = page.data.mapMarkers.find(({ stopId }) => stopId === stop.id)!
  assert.ok(marker, 'published review point must remain on the source map')
  assert.equal(marker.latitude, stop.coordinate.latitude)
  assert.equal(marker.longitude, stop.coordinate.longitude)
  assert.match(marker.callout.content, /待核对/)
  const option = page.data.stopOptions.find(({ id }) => id === stop.id)!
  assert.ok(option, 'the same physical record is still served by route 3')
  assert.doesNotMatch(option.label, /3路B线/)
  assert.match(option.label, /3号线/)
  assert.match(page.data.directionStatusText, /运营方向.*未.*确认/)
})

test('a valid B-line ride passes the source geometry without presenting the offset point as a boarding stop', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad({ routeId: 'route_3b' })
  const dataset = runtime.dataset()
  const route = dataset.routes.find(({ id }) => id === 'route_3b')!
  const suspect = route.visits.find(({ offsetMeters }) => offsetMeters > 35)!
  const destination = dataset.stops.find(({ name }) => name === '橘园新七舍')!
  page.handleOriginChange({ detail: { value: String(page.data.stopOptions.findIndex(({ id }) => id === route.visits[0].stopId)) } })
  page.handleDestinationChange({ detail: { value: String(page.data.stopOptions.findIndex(({ id }) => id === destination.id)) } })
  page.handlePlanJourney()
  const direct = page.data.journeys.find((journey) => journey.legs.length === 1 && journey.legs[0].routeId === 'route_3b')!
  assert.ok(direct)
  assert.ok(!direct.legs[0].stopIds.includes(suspect.stopId))
  assert.ok(direct.legs[0].points.length > 2)
  assert.ok(direct.legs[0].boardingVisitIndex < direct.legs[0].alightingVisitIndex)
})
