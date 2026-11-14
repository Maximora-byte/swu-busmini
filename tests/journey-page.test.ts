import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import type { Coordinate } from '../miniprogram/models/index'
import type { TransitDataset, TransitVisitDirection } from '../miniprogram/models/current-transit'
import type { TransitJourney } from '../miniprogram/services/navigation/transit-journey.service'
import type { CampusSearchSuggestion } from '../miniprogram/services/navigation/campus-place-search.service'
import type { CurrentRouteStopView } from '../miniprogram/services/map/current-transit-map.service'
import type { SheetGeometry, SheetSnap } from '../miniprogram/services/map/map-sheet-layout'
import type { UnifiedTransitStop } from '../miniprogram/services/map/unified-transit-stops'

interface PageData {
  originAllowedVisits: TransitVisitDirection[] | null
  destinationAllowedVisits: TransitVisitDirection[] | null
  selectedStation: UnifiedTransitStop | null
  sheetSnap: SheetSnap
  sheetGeometry: SheetGeometry
  focusedSearchField: string
  keyboardHeight: number
  journeyPreview: { boardingName: string; alightingName: string; title: string } | null
  viewMode: string
  showAllRoutes: boolean
  referenceReverse: boolean
  routeStops: CurrentRouteStopView[]
  routeSummary: string
  mapLegend: { routeId: string; name: string; color: string }[]
  mapLocation: Coordinate | null
  mapLocating: boolean
  mapLocationMessage: string
  latitude: number
  longitude: number
  scale: number
  routeOptions: { id: string; name: string }[]
  selectedRouteId: string
  sourceText: string
  directionStatusText: string
  stopOptions: { id: string; label: string }[]
  originIndex: number
  destinationIndex: number
  originMode: string
  originCoordinate: Coordinate | null
  destinationMode: string
  destinationCoordinate: Coordinate | null
  originQuery: string
  destinationQuery: string
  searchResults: CampusSearchSuggestion[]
  placeSelectionMessage: string
  nativePlacePicking: boolean
  originPlaceDetails: string
  destinationPlaceDetails: string
  destinationNearbyStops: CampusSearchSuggestion['nearbyStops']
  searchVersion: number
  activeSearchField: string
  mapSelectionField: string
  mapSelectionMessage: string
  mapCircles: (Coordinate & { color: string })[]
  mapFitPoints: Coordinate[]
  journeys: (TransitJourney & { isRecommended: boolean; connectionText: string })[]
  selectedJourneyId: string
  journeyMessage: string
  locationMessage: string
  locating: boolean
  mapPolylines: { points: Coordinate[] }[]
  mapMarkers: { id: number; stationId?: string; stopIds?: string[]; stopId: string; latitude: number; longitude: number; callout: { content: string } }[]
}
interface Event { currentTarget: { dataset: { routeId?: string; journeyId?: string; legIndex?: number; pointKind?: string; field?: string; suggestionId?: string; stopId?: string; searchVersion?: number; view?: string; order?: string; visitKey?: string; directionId?: string } } }
interface JourneyPage {
  handleMarkerTap(event: { detail: { markerId: number } }): void
  handleCloseStation(): void
  handleUseStation(event: Event): void
  handleUseStationVisit(event: Event): void
  handleUseStationDirection(event: Event): void
  data: PageData
  selectComponent?(selector: string): { hasPendingPrivacy?(): boolean } | null
  setData(update: Partial<PageData>, callback?: () => void): void
  onLoad(query?: { routeId?: string }): void
  onReady(): void
  onHide(): void
  onShow(): void
  onUnload(): void
  handleRouteChange(event: Event): void
  handleOriginChange(event: { detail: { value: string } }): void
  handleDestinationChange(event: { detail: { value: string } }): void
  handleExactStopChange(event: Event & { detail: { value: string } }): void
  handlePlanJourney(): void
  handleShowJourney(event: Event): void
  handleOpenStop(event: Event): void
  handleUseLocation(): Promise<void>
  handleSearchInput(event: Event & { detail: { value: string } }): void
  handleSearchFocus(event: Event): void
  handleSelectSearchResult(event: Event): void
  handleChooseTencentPlace(event: Event): Promise<void>
  handleStartMapSelection(event: Event): void
  handleCancelMapSelection(): void
  handleMapTap(event: { detail: Coordinate }): void
  handleViewChange(event: Event): void
  handleNetworkChange(event: { detail: { value: boolean } }): void
  handleReferenceOrderChange(event: Event): void
  handleRouteStopTap(event: Event): void
  handleUseRouteStop(event: Event): void
  handleCampusOverview(): void
  handleBeibeiOverview(): void
  handleMapLocate(): Promise<void>
  setSheetSnap(snap: SheetSnap): void
  handleSheetGestureEnd(value: { snap: string; epoch: number }): void
  handleOpenPlanner(): void
  handleBrowseRoutes(): void
  handleShowJourneyDetails(): void
  handleSwapEndpoints(): void
  handleDismissKeyboard(): void
  onResize(event: { size: { windowWidth: number; windowHeight: number } }): void
  handleKeyboardHeightChange(event: { detail: { height: number }; currentTarget: { dataset: { field: string } } }): void
}

function createRuntime(deferRendering = false, deferMapMeasurement = false) {
  const root = fileURLToPath(new URL('../miniprogram/', import.meta.url))
  const modules = new Map<string, { exports: unknown }>()
  const pendingRendering: (() => void)[] = []
  const pendingLocation: { success(result: Coordinate & { accuracy: number }): void; fail(error: { errMsg: string }): void }[] = []
  const pendingPlace: { success(result: Coordinate & { name: string; address: string }): void; fail(error: { errMsg: string }): void }[] = []
  const fitPoints: Coordinate[][] = []
  const cameraMoves: Coordinate[] = []
  const fitPadding: number[][] = []
  const pendingMapMeasurement: ((rect: { width: number; height: number }) => void)[] = []
  const openedStops: Coordinate[] = []
  let mapPayloadWrites = 0
  let page: JourneyPage | undefined
  const wx = {
    getWindowInfo() { return { windowWidth: 375, windowHeight: 667, screenHeight: 667, safeArea: { bottom: 667 } } },
    createMapContext() {
      return { setBoundary() {}, moveToLocation(point: Coordinate) { cameraMoves.push(point) }, includePoints(options: { points: Coordinate[]; padding: number[] }) {
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
    chooseLocation(options: (typeof pendingPlace)[number]) { pendingPlace.push(options) },
    openLocation(options: Coordinate) { openedStops.push({ latitude: options.latitude, longitude: options.longitude }) },
    navigateTo() {},
    hideKeyboard() {},
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
            if ('mapPolylines' in update) mapPayloadWrites += 1
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
    fitPoints, fitPadding, openedStops, cameraMoves, mapPayloadWrites: () => mapPayloadWrites,
    pendingLocationCount: () => pendingLocation.length,
    resolvePlace(coordinate: Coordinate, name = '腾讯地图选择位置') { assert.ok(pendingPlace.length); pendingPlace.shift()!.success({ ...coordinate, name, address: '校园参考地址' }) },
    rejectPlace(message = 'chooseLocation:fail cancel') { assert.ok(pendingPlace.length); pendingPlace.shift()!.fail({ errMsg: message }) },
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
  assert.equal(page.data.selectedRouteId, '')
  assert.equal(page.data.mapPolylines.length, 10)
  assert.equal(JSON.stringify(page.data.mapPolylines.map(({ points }) => points)), JSON.stringify(runtime.dataset().routes.map(({ points }) => points)))
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
  assert.ok(top > 0 && bottom > 0, 'search chrome, callouts and the bottom sheet all need map space')
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
  assert.equal(page.data.originMode, 'location')
  assert.equal(page.data.originCoordinate, null)
})

test('reading the privacy contract preserves pending origin GPS until return and explicit agreement', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  let privacyPending = true
  page.selectComponent = selector => selector === '#privacy-consent' ? { hasPendingPrivacy: () => privacyPending } : null
  const locating = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.onHide()
  assert.equal(page.data.locating, true)
  assert.equal(page.data.originCoordinate, null)
  page.onShow()
  privacyPending = false
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await locating
  assert.equal(page.data.originMode, 'coordinate')
  assert.equal((page.data.originCoordinate as Coordinate | null)?.latitude, 29.82)
  assert.equal(page.data.locating, false)
})

test('reading the privacy contract preserves pending map GPS without changing planner origin', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  let privacyPending = true
  page.selectComponent = () => ({ hasPendingPrivacy: () => privacyPending })
  const locating = page.handleMapLocate()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.onHide()
  assert.equal(page.data.mapLocating, true)
  assert.equal(page.data.mapLocation, null)
  page.onShow()
  privacyPending = false
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await locating
  assert.equal((page.data.mapLocation as Coordinate | null)?.latitude, 29.82)
  assert.equal(page.data.mapLocating, false)
  assert.equal(page.data.originCoordinate, null)
  assert.equal(runtime.cameraMoves.length, 1)
  assert.equal(runtime.cameraMoves[0].latitude, 29.82)
  assert.equal(runtime.cameraMoves[0].longitude, 106.42)
})

test('unloading still invalidates an origin fix while privacy agreement is pending', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.selectComponent = () => ({ hasPendingPrivacy: () => true })
  const locating = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.onUnload()
  page.onShow()
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await locating
  assert.equal(page.data.originMode, 'location')
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
  assert.equal(page.data.originMode, 'location')
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
  assert.equal(page.data.originMode, 'location')
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

test('network markers open a unified station with all published lines and can return to browsing', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  assert.ok(page.data.mapMarkers.length < runtime.dataset().stops.length)
  const marker = page.data.mapMarkers.find((item) => (item.stopIds?.length ?? 0) > 1)!
  assert.ok(marker)
  page.handleMarkerTap({ detail: { markerId: marker.id } })
  assert.ok(page.data.selectedStation)
  assert.ok(page.data.selectedStation!.routes.length > 1)
  assert.equal(page.data.sheetSnap, 'half')
  const focusedPoints = runtime.fitPoints[runtime.fitPoints.length - 1]
  assert.equal(focusedPoints.length, 2)
  assert.ok(Math.abs((focusedPoints[0].latitude + focusedPoints[1].latitude) / 2 - marker.latitude) < 1e-8)
  page.handleUseStation({ currentTarget: { dataset: { field: 'destination' } } })
  assert.equal(page.data.destinationMode, 'place')
  assert.equal(page.data.selectedStation, null)
  assert.equal(page.data.viewMode, 'journey')
  page.handleMarkerTap({ detail: { markerId: marker.id } })
  page.handleCloseStation()
  assert.equal(page.data.selectedStation, null)
})

test('unified station keeps quarantined line actions disabled and uses exact eligible source records', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad({ routeId: 'route_3b' })
  const stop = page.data.routeStops.find((item) => !item.canBoard)!
  const marker = page.data.mapMarkers.find((item) => item.stopIds?.includes(stop.stopId))!
  assert.ok(marker)
  page.handleMarkerTap({ detail: { markerId: marker.id } })
  const blocked = page.data.selectedStation!.routes.find((route) => route.routeId === 'route_3b')!.visits.find((visit) => !visit.canBoard)!
  page.handleUseStationVisit({ currentTarget: { dataset: { field: 'origin', visitKey: blocked.key } } })
  assert.equal(page.data.originMode, 'location')
  const eligible = page.data.selectedStation!.routes.find((route) => route.routeId === 'route_3')!.visits.find((visit) => visit.canBoard)!
  page.handleUseStationVisit({ currentTarget: { dataset: { field: 'origin', visitKey: eligible.key } } })
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.stopOptions[page.data.originIndex].id, eligible.stopId)
  assert.equal(page.data.selectedStation, null)
})

test('station focus retains visible map space in compact supported windows', () => {
  for (const height of [559, 480]) {
    const runtime = createRuntime()
    const page = runtime.page()
    page.onLoad()
    page.onReady()
    page.onResize({ size: { windowWidth: 375, windowHeight: height } })
    const count = runtime.fitPoints.length
    page.handleMarkerTap({ detail: { markerId: page.data.mapMarkers[0].id } })
    assert.ok(runtime.fitPoints.length > count, `station focus must still fit at ${height}px`)
    assert.equal(runtime.fitPoints[runtime.fitPoints.length - 1].length, 2)
    const padding = runtime.fitPadding[runtime.fitPadding.length - 1]
    assert.ok(padding[0] + padding[2] < 294, 'the focused station must retain a visible map area')
  }
})

test('station reference choice reaches the planner and editing only resets the changed endpoint', () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad()
  const marker = page.data.mapMarkers.find((m) => m.stopIds!.some((id) => runtime.dataset().stops.find((s) => s.id === id)?.name === '经管院'))!
  page.handleMarkerTap({ detail: { markerId: marker.id } })
  const direction = page.data.selectedStation!.directions.find((d) => d.canDepart)!
  page.handleUseStationDirection({ currentTarget: { dataset: { field: 'origin', directionId: direction.id } } })
  assert.equal(page.data.originMode, 'place')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.originAllowedVisits)), JSON.parse(JSON.stringify(direction.allowedVisits)))
  const saved = JSON.stringify(page.data.originAllowedVisits)
  const destinationIndex = page.data.stopOptions.findIndex((s) => runtime.dataset().stops.find((stop) => stop.id === s.id)?.name === '5号门')
  page.handleDestinationChange({ detail: { value: String(destinationIndex) } })
  assert.equal(JSON.stringify(page.data.originAllowedVisits), saved)
  page.handlePlanJourney()
  for (const journey of page.data.journeys) {
    const leg = journey.legs[0]
    assert.ok(direction.allowedVisits.some((rule) => rule.routeId === leg.routeId && rule.visitIndex === leg.boardingVisitIndex && rule.directionId === leg.directionId))
  }
  page.handleSwapEndpoints()
  assert.equal(page.data.originAllowedVisits, null)
  assert.equal(JSON.stringify(page.data.destinationAllowedVisits), saved)
  page.handleSearchInput({ currentTarget: { dataset: { field: 'destination' } }, detail: { value: '田家炳' } })
  assert.equal(page.data.destinationAllowedVisits, null)
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

function searchInput(page: JourneyPage, field: string, value: string) {
  page.handleSearchInput({ currentTarget: { dataset: { field } }, detail: { value } })
}
function selectSuggestion(page: JourneyPage, field: string, name: string) {
  const suggestion = page.data.searchResults.find((result) => result.name === name)!
  assert.ok(suggestion, `expected a search result for ${name}`)
  page.handleSelectSearchResult({ currentTarget: { dataset: { field, stopId: suggestion.stopId, searchVersion: page.data.searchVersion } } })
  return suggestion
}

test('campus address aliases select actual POI coordinates and recommend nearby stops', () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad(); page.onReady()
  page.handleOriginChange({ detail: { value: '0' } })
  searchInput(page, 'destination', '校园卡服务')
  const place = page.data.searchResults.find(({ kind, coordinate }) => kind === 'place' && coordinate)!
  assert.ok(place, 'guide service alias must resolve to its mapped building')
  page.handleSelectSearchResult({ currentTarget: { dataset: { field: 'destination', suggestionId: place.id, searchVersion: page.data.searchVersion } } })
  assert.equal(page.data.destinationMode, 'place')
  assert.equal(page.data.destinationIndex, -1, 'a building must not silently become an exact bus stop')
  assert.equal(JSON.stringify(page.data.destinationCoordinate), JSON.stringify(place.coordinate))
  assert.ok(page.data.destinationNearbyStops.length)
  assert.match(page.data.destinationPlaceDetails, /1楼/)
  assert.ok(page.data.journeys.length)
})

test('name-only campus guides cannot invent a location or start GPS planning', () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad()
  searchInput(page, 'destination', '本科生院')
  const guide = page.data.searchResults.find(({ kind }) => kind === 'place')!
  assert.ok(guide); assert.equal(guide.coordinate, null)
  page.handleSelectSearchResult({ currentTarget: { dataset: { field: 'destination', suggestionId: guide.id, searchVersion: page.data.searchVersion } } })
  assert.equal(page.data.destinationCoordinate, null)
  assert.equal(page.data.destinationMode, 'search')
  assert.equal(page.data.journeys.length, 0)
  assert.equal(runtime.pendingLocationCount(), 0)
  assert.match(page.data.placeSelectionMessage, /选.*位置|选点/)
  assert.equal(page.data.focusedSearchField, '', 'show the selected guide without keeping its editable search input focused')
})

test('Tencent picker cancellation preserves the selected journey and typed endpoints', async () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad(); selectStopPair(page, runtime.dataset()); page.handlePlanJourney()
  const before = [page.data.originQuery, page.data.destinationQuery, page.data.selectedJourneyId]
  const request = page.handleChooseTencentPlace({ currentTarget: { dataset: { field: 'destination' } } })
  runtime.rejectPlace(); await request
  assert.deepEqual([page.data.originQuery, page.data.destinationQuery, page.data.selectedJourneyId], before)
  assert.equal(page.data.nativePlacePicking, false)
})

test('Tencent picker commits a real GCJ02 point on return and manual edits reject stale results', async () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad(); page.handleOriginChange({ detail: { value: '0' } })
  const point = runtime.dataset().stops[28].coordinate
  let request = page.handleChooseTencentPlace({ currentTarget: { dataset: { field: 'destination' } } })
  page.onHide()
  runtime.resolvePlace(point, '地图选择的办事地点'); await request
  assert.equal(page.data.destinationCoordinate, null, 'do not update a hidden page')
  page.onShow()
  assert.equal(JSON.stringify(page.data.destinationCoordinate), JSON.stringify(point))
  assert.match(page.data.destinationPlaceDetails, /腾讯地图/)
  assert.ok(page.data.journeys.length)
  request = page.handleChooseTencentPlace({ currentTarget: { dataset: { field: 'destination' } } })
  searchInput(page, 'destination', '新的输入')
  runtime.resolvePlace(point); await request
  assert.equal(page.data.destinationCoordinate, null)
  assert.equal(page.data.destinationQuery, '新的输入')
})

test('Tencent picker errors and out-of-area results never overwrite a confirmed endpoint', async () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad(); selectStopPair(page, runtime.dataset())
  let request = page.handleChooseTencentPlace({ currentTarget: { dataset: { field: 'destination' } } })
  runtime.rejectPlace('chooseLocation:fail no permission'); await request
  assert.match(page.data.placeSelectionMessage, /未开放|不可用|权限/)
  const query = page.data.destinationQuery
  request = page.handleChooseTencentPlace({ currentTarget: { dataset: { field: 'destination' } } })
  runtime.resolvePlace({ latitude: 39.9, longitude: 116.4 }); await request
  assert.equal(page.data.destinationQuery, query)
  assert.match(page.data.placeSelectionMessage, /范围/)
})

test('choosing an unlocated building guide invalidates an identically named station coordinate', () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad(); page.handleOriginChange({ detail: { value: '0' } })
  searchInput(page, 'destination', '行署楼')
  const station = page.data.searchResults.find(({ kind }) => kind === 'stop')!
  assert.ok(station)
  page.handleSelectSearchResult({ currentTarget: { dataset: { field: 'destination', suggestionId: station.id, searchVersion: page.data.searchVersion } } })
  assert.ok(page.data.destinationCoordinate)
  page.handleSearchFocus({ currentTarget: { dataset: { field: 'destination' } } })
  const guide = page.data.searchResults.find(({ coordinate }) => coordinate === null)!
  assert.ok(guide)
  page.handleSelectSearchResult({ currentTarget: { dataset: { field: 'destination', suggestionId: guide.id, searchVersion: page.data.searchVersion } } })
  assert.equal(page.data.destinationCoordinate, null)
  assert.equal(page.data.destinationMode, 'search')
  assert.equal(page.data.destinationIndex, -1)
  assert.equal(page.data.selectedJourneyId, '')
  assert.equal(page.data.journeys.length, 0)
})

test('opening native picker cancels a pending map-only fix without leaving location disabled', async () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad()
  const mapLocation = page.handleMapLocate()
  await new Promise<void>((resolve) => setImmediate(resolve))
  const picker = page.handleChooseTencentPlace({ currentTarget: { dataset: { field: 'destination' } } })
  page.onHide()
  runtime.resolveLocation(runtime.dataset().stops[0].coordinate); await mapLocation
  runtime.rejectPlace(); await picker
  page.onShow()
  assert.equal(page.data.mapLocating, false)
  assert.equal(page.data.mapLocation, null)
})

test('confirmed search locations automatically recommend both ends and retain exact-stop selection', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  searchInput(page, 'origin', '经济管理学院')
  const source = selectSuggestion(page, 'origin', '经管院')
  searchInput(page, 'destination', '医院')
  selectSuggestion(page, 'destination', '校医院')
  assert.equal(page.data.originMode, 'place')
  assert.equal(page.data.destinationMode, 'place')
  const reference = runtime.dataset().stops.find(({ id }) => id === source.stopId)!.coordinate
  assert.equal(JSON.stringify(page.data.originCoordinate), JSON.stringify(reference))
  assert.ok(page.data.journeys.length)
  assert.equal(page.data.selectedJourneyId, page.data.journeys[0].id)
  assert.equal(page.data.journeys[0].isRecommended, true)
  assert.ok(page.data.journeys.slice(1).every((journey) => !journey.isRecommended))
  assert.match(page.data.journeys[0].connectionText, /上车.*下车/)
  assert.equal(page.data.mapCircles.length, 2)
  assert.ok(page.data.mapFitPoints.some(({ latitude, longitude }) => latitude === reference.latitude && longitude === reference.longitude))
  page.handleOriginChange({ detail: { value: '0' } })
  page.handleDestinationChange({ detail: { value: '28' } })
  page.handlePlanJourney()
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.destinationMode, 'stop')
  assert.equal(page.data.journeys[0].legs.length, 2, 'explicit 经管院·1号线 still needs the exact gate5 transfer')
  assert.equal(page.data.mapCircles.length, 0)
})

test('editing or clearing a selected place cannot silently plan from its old coordinate', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  searchInput(page, 'origin', '中图')
  selectSuggestion(page, 'origin', '中心图书馆')
  searchInput(page, 'origin', '完全不存在的地点')
  assert.equal(page.data.originCoordinate, null)
  assert.equal(page.data.journeys.length, 0)
  assert.equal(page.data.searchResults.length, 0)
  page.handlePlanJourney()
  assert.equal(page.data.journeys.length, 0)
  assert.match(page.data.journeyMessage, /起点.*选择|选择.*起点/)
  searchInput(page, 'origin', '')
  page.handlePlanJourney()
  assert.equal(page.data.journeys.length, 0)
  assert.equal(page.data.originQuery, '')
})

test('stale search clicks from an earlier query or field cannot commit a place', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  searchInput(page, 'origin', '经管')
  const old = { field: 'origin', stopId: page.data.searchResults[0].stopId, searchVersion: page.data.searchVersion }
  searchInput(page, 'origin', '经管院')
  page.handleSelectSearchResult({ currentTarget: { dataset: old } })
  assert.equal(page.data.originCoordinate, null)
  page.handleSearchFocus({ currentTarget: { dataset: { field: 'destination' } } })
  page.handleSelectSearchResult({ currentTarget: { dataset: { ...old, searchVersion: page.data.searchVersion } } })
  assert.equal(page.data.originCoordinate, null)
})

test('typing while GPS is pending cancels that request and preserves the search text', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  const request = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  searchInput(page, 'origin', '中图')
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await request
  assert.equal(page.data.originQuery, '中图')
  assert.equal(page.data.originMode, 'search')
  assert.equal(page.data.originCoordinate, null)
  assert.equal(page.data.locating, false)
})

test('map selection requires an explicit field, validates coordinates and supports cancellation', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  page.handleDestinationChange({ detail: { value: '1' } })
  const point = { ...runtime.dataset().stops[0].coordinate }
  page.handleMapTap({ detail: point })
  assert.equal(page.data.originMode, 'location')
  page.handleStartMapSelection({ currentTarget: { dataset: { field: 'destination' } } })
  page.handleCancelMapSelection()
  page.handleMapTap({ detail: point })
  assert.equal(page.data.destinationCoordinate, null)
  page.handleStartMapSelection({ currentTarget: { dataset: { field: 'origin' } } })
  page.handleMapTap({ detail: { latitude: 91, longitude: 106.42 } })
  assert.equal(page.data.originCoordinate, null)
  assert.equal(page.data.mapSelectionField, 'origin')
  page.handleMapTap({ detail: point })
  assert.equal(page.data.originMode, 'map')
  assert.equal(JSON.stringify(page.data.originCoordinate), JSON.stringify(point))
  assert.equal(page.data.mapSelectionField, '')
  assert.ok(page.data.journeys.length)
  assert.ok(page.data.mapCircles.some(({ latitude }) => latitude === point.latitude))
  page.handleStartMapSelection({ currentTarget: { dataset: { field: 'destination' } } })
  page.onHide()
  page.onShow()
  page.handleMapTap({ detail: point })
  assert.equal(page.data.destinationCoordinate, null, 'leaving the page cancels the map selection session')
})

test('map points on both ends auto-plan and a far point keeps its reference without an old journey', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  const select = (field: string, coordinate: Coordinate) => {
    page.handleStartMapSelection({ currentTarget: { dataset: { field } } })
    page.handleMapTap({ detail: coordinate })
  }
  select('origin', runtime.dataset().stops[0].coordinate)
  select('destination', runtime.dataset().stops[28].coordinate)
  assert.equal(page.data.destinationMode, 'map')
  assert.ok(page.data.journeys.length)
  assert.equal(page.data.mapCircles.length, 2)
  select('destination', { latitude: 29.9, longitude: 106.5 })
  assert.equal(page.data.journeys.length, 0)
  assert.match(page.data.journeyMessage, /800|范围/)
  assert.ok(page.data.mapCircles.some(({ longitude }) => longitude === 106.5))
  assert.ok(page.data.mapFitPoints.some(({ latitude, longitude }) => latitude === 29.9 && longitude === 106.5),
    'look-at-all must retain the selected reference even when no journey is available')
  page.handleViewChange({ currentTarget: { dataset: { view: 'map' } } })
  page.handleViewChange({ currentTarget: { dataset: { view: 'journey' } } })
  assert.equal(page.data.mapCircles.length, 2, 'returning to a no-result plan must restore its selected references')
  assert.ok(page.data.mapFitPoints.some(({ latitude, longitude }) => latitude === 29.9 && longitude === 106.5))
})

test('a successful location request automatically refreshes the recommendation for a selected destination', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  searchInput(page, 'origin', '')
  searchInput(page, 'destination', '校医院')
  selectSuggestion(page, 'destination', '校医院')
  const locating = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.resolveLocation(runtime.dataset().stops[0].coordinate)
  await locating
  assert.equal(page.data.originMode, 'coordinate')
  assert.ok(page.data.journeys.length, 'the user should not need a second query action after GPS completes')
})

test('unified campus map defaults to current data and all-route mode has an accurate legend', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  assert.equal(page.data.viewMode, 'map')
  assert.equal(page.data.mapLegend.length, 10)
  page.handleNetworkChange({ detail: { value: true } })
  assert.equal(page.data.mapLegend.length, 10)
  assert.equal(page.data.mapPolylines.length, 10)
  assert.ok(!page.data.mapLegend.some(({ routeId }) => routeId === 'route_9'))
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_8' } } })
  assert.equal(page.data.showAllRoutes, false)
  assert.equal(page.data.mapLegend[0].routeId, 'route_8')
  assert.equal(page.data.mapLegend[0].color, '#a660d9')
})

test('campus browsing preserves the chosen journey and restores its actual line legend on return', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.handleOriginChange({ detail: { value: '0' } })
  page.handleDestinationChange({ detail: { value: '28' } })
  page.handlePlanJourney()
  const selected = page.data.selectedJourneyId
  assert.equal(page.data.viewMode, 'journey')
  page.handleViewChange({ currentTarget: { dataset: { view: 'map' } } })
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_8' } } })
  page.handleNetworkChange({ detail: { value: true } })
  assert.equal(page.data.mapLegend.length, 10)
  page.handleViewChange({ currentTarget: { dataset: { view: 'journey' } } })
  assert.equal(page.data.selectedJourneyId, selected)
  assert.equal(page.data.originIndex, 0)
  assert.equal(page.data.destinationIndex, 28)
  assert.deepEqual(Array.from(page.data.mapLegend, ({ routeId }) => routeId), ['route_1', 'route_2'])
})

test('reference order and stop focus retain published geometry and quarantine route-specific actions', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad({ routeId: 'route_3b' })
  page.onReady()
  const keys = Array.from(page.data.routeStops, ({ key }) => key)
  const geometry = JSON.stringify(page.data.mapPolylines[0].points)
  page.handleReferenceOrderChange({ currentTarget: { dataset: { order: 'reverse' } } })
  assert.deepEqual(Array.from(page.data.routeStops, ({ key }) => key), keys.reverse())
  assert.equal(JSON.stringify(page.data.mapPolylines[0].points), geometry)
  const gate = page.data.routeStops.find(({ name }) => name === '2号门')!
  const oldOrigin = page.data.originIndex
  page.handleUseRouteStop({ currentTarget: { dataset: { field: 'origin', visitKey: gate.key } } })
  assert.equal(page.data.originIndex, oldOrigin)
  page.handleRouteStopTap({ currentTarget: { dataset: { visitKey: gate.key } } })
  assert.equal(page.data.latitude, gate.coordinate.latitude)
  assert.equal(page.data.longitude, gate.coordinate.longitude)
  const valid = page.data.routeStops.find(({ canBoard }) => canBoard)!
  page.handleUseRouteStop({ currentTarget: { dataset: { field: 'origin', visitKey: valid.key } } })
  assert.equal(page.data.viewMode, 'journey')
  assert.equal(page.data.stopOptions[page.data.originIndex].id, valid.stopId)
})

test('map-only location preserves planned endpoints and a later overview prevents a camera jump', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  const oldOrigin = page.data.originIndex
  const locating = page.handleMapLocate()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.handleCampusOverview()
  const cameraCount = runtime.cameraMoves.length
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await locating
  assert.equal(page.data.originMode, 'location')
  assert.equal(page.data.originIndex, oldOrigin)
  assert.equal(page.data.mapLocation?.latitude, 29.82)
  assert.equal(runtime.cameraMoves.length, cameraCount)
  assert.equal(page.data.mapLocating, false)
})

test('switching tabs or hiding cancels the map-only locating status and discards its old result', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  const first = page.handleMapLocate()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.handleViewChange({ currentTarget: { dataset: { view: 'journey' } } })
  assert.equal(page.data.mapLocating, false)
  assert.doesNotMatch(page.data.mapLocationMessage, /正在定位/)
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await first
  assert.equal(page.data.mapLocation, null)
  page.handleViewChange({ currentTarget: { dataset: { view: 'map' } } })
  const second = page.handleMapLocate()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.onHide()
  runtime.resolveLocation({ latitude: 29.82, longitude: 106.42 })
  await second
  page.onShow()
  assert.equal(page.data.mapLocating, false)
  assert.doesNotMatch(page.data.mapLocationMessage, /正在定位/)
  assert.equal(page.data.mapLocation, null)
})

test('glass home defaults to current location and waits for a destination before requesting GPS', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  assert.equal(page.data.originMode, 'location')
  assert.equal(page.data.originQuery, '当前位置')
  assert.equal(page.data.originCoordinate, null)
  assert.equal(runtime.pendingLocationCount(), 0)
  assert.equal(page.data.destinationQuery, '')
  page.handlePlanJourney()
  assert.equal(page.data.journeys.length, 0)
  assert.equal(page.data.sheetSnap, 'full')
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(runtime.pendingLocationCount(), 0, 'no destination means no location request')
  searchInput(page, 'destination', '校医院')
  selectSuggestion(page, 'destination', '校医院')
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(runtime.pendingLocationCount(), 1)
  assert.equal(page.data.locating, true)
  page.handlePlanJourney()
  assert.equal(runtime.pendingLocationCount(), 1, 'repeated planning must not duplicate GPS')
  runtime.resolveLocation(runtime.dataset().stops[0].coordinate)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(page.data.originMode, 'coordinate')
  assert.equal(page.data.originQuery, '当前位置')
  assert.ok(page.data.journeys.length, 'a destination and a real fix automatically recommend a route')
})

test('automatic origin failure never fabricates a station and manual input cancels a delayed fix', async () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad()
  searchInput(page, 'destination', '校医院')
  selectSuggestion(page, 'destination', '校医院')
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.rejectLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(page.data.originCoordinate, null)
  assert.equal(page.data.originMode, 'location')
  assert.equal(page.data.originQuery, '当前位置')
  assert.equal(page.data.journeys.length, 0)
  assert.match(page.data.locationMessage, /权限|定位失败/)
  assert.equal(runtime.pendingLocationCount(), 0)
  const retry = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  searchInput(page, 'origin', '中图')
  runtime.resolveLocation(runtime.dataset().stops[0].coordinate)
  await retry
  assert.equal(page.data.originQuery, '中图')
  assert.equal(page.data.originCoordinate, null)
})

test('correcting a destination during automatic GPS keeps current-origin intent and rejects the older fix', async () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad()
  searchInput(page, 'destination', '校医院')
  selectSuggestion(page, 'destination', '校医院')
  await new Promise<void>((resolve) => setImmediate(resolve))
  searchInput(page, 'destination', '中图')
  selectSuggestion(page, 'destination', '中心图书馆')
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(runtime.pendingLocationCount(), 2)
  assert.equal(page.data.originMode, 'location')
  runtime.rejectLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(page.data.locating, true, 'the older failure must not stop the newer request')
  assert.equal(page.data.originCoordinate, null)
  runtime.resolveLocation(runtime.dataset().stops[0].coordinate)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(page.data.destinationQuery, '中心图书馆')
  assert.equal(page.data.originMode, 'coordinate')
  assert.ok(page.data.journeys.length)
})

test('default planning overview has no preselected line and manual browsing does not constrain the planner', () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad()
  assert.equal(page.data.selectedRouteId, '')
  assert.equal(page.data.showAllRoutes, true)
  assert.equal(page.data.mapPolylines.length, 10)
  page.handleOpenPlanner()
  assert.equal(page.data.mapLegend.length, 10)
  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_8' } } })
  page.handleOriginChange({ detail: { value: '0' } })
  page.handleDestinationChange({ detail: { value: '28' } })
  page.handlePlanJourney()
  assert.deepEqual(Array.from(page.data.journeys[0].legs, ({ routeId }) => routeId), ['route_1', 'route_2'])
})

test('swapping an unresolved current origin leaves the destination unconfirmed', () => {
  const runtime = createRuntime(), page = runtime.page()
  page.onLoad()
  page.handleDestinationChange({ detail: { value: '28' } })
  page.handleSwapEndpoints()
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.originIndex, 28)
  assert.equal(page.data.destinationMode, 'search')
  assert.equal(page.data.destinationQuery, '')
  assert.equal(page.data.journeys.length, 0)
  assert.equal(runtime.pendingLocationCount(), 0)
})

test('settled sheet state controls map fitting and stale drag completion is ignored', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.onReady()
  const epoch = page.data.sheetGeometry.epoch
  page.setSheetSnap('full')
  const fits = runtime.fitPoints.length
  page.handleSheetGestureEnd({ snap: 'peek', epoch })
  assert.equal(page.data.sheetSnap, 'full')
  assert.equal(runtime.fitPoints.length, fits)
  page.handleSheetGestureEnd({ snap: 'peek', epoch: page.data.sheetGeometry.epoch })
  assert.equal(page.data.sheetSnap, 'peek')
  assert.ok(runtime.fitPoints.length > fits)
})

test('compact recommendation and editing stay on the same map and preserve the selected journey', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.handleOriginChange({ detail: { value: '0' } })
  page.handleDestinationChange({ detail: { value: '28' } })
  page.handlePlanJourney()
  const selected = page.data.selectedJourneyId
  assert.equal(page.data.sheetSnap, 'peek')
  assert.equal(page.data.journeyPreview?.boardingName, '经管院')
  assert.equal(page.data.journeyPreview?.alightingName, '校医院')
  page.handleShowJourneyDetails()
  assert.equal(page.data.sheetSnap, 'full')
  page.handleBrowseRoutes()
  page.handleOpenPlanner()
  assert.equal(page.data.selectedJourneyId, selected)
})

test('failed GPS has no default origin but can fall back to a genuinely confirmed station', async () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  let request = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.rejectLocation()
  await request
  assert.equal(page.data.originMode, 'location')
  assert.equal(page.data.originQuery, '当前位置')
  page.handleOriginChange({ detail: { value: '2' } })
  request = page.handleUseLocation()
  await new Promise<void>((resolve) => setImmediate(resolve))
  runtime.rejectLocation()
  await request
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.originIndex, 2)
})

test('typing several characters does not resend unchanged map geometry on each input', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  const writes = runtime.mapPayloadWrites()
  for (const value of ['中', '中心', '中心图', '中心图书馆']) searchInput(page, 'destination', value)
  assert.equal(runtime.mapPayloadWrites(), writes)
  assert.equal(page.data.sheetSnap, 'full', 'active input must expose its suggestions in the sheet')
})

test('swapping confirmed endpoints replans the opposite source geometry without changing stop identities', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.handleOriginChange({ detail: { value: '54' } })
  page.handleDestinationChange({ detail: { value: '68' } })
  page.handlePlanJourney()
  page.handleSwapEndpoints()
  assert.equal(page.data.originIndex, 68)
  assert.equal(page.data.destinationIndex, 54)
  assert.equal(page.data.journeys[0].legs[0].directionId, 'reverse')
  assert.equal(page.data.journeys[0].legs[0].points.length, 61)
})

test('keyboard space shrinks only the visible sheet scroll area and stale keyboard events cannot reopen it', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.handleOpenPlanner()
  const fullHeight = page.data.sheetGeometry.scrollHeight
  page.handleKeyboardHeightChange({ currentTarget: { dataset: { field: 'destination' } }, detail: { height: 220 } })
  assert.equal(page.data.sheetGeometry.scrollHeight, fullHeight - 220)
  page.onResize({ size: { windowWidth: 375, windowHeight: 447 } })
  assert.equal(page.data.sheetGeometry.windowHeight, 667)
  page.handleKeyboardHeightChange({ currentTarget: { dataset: { field: 'destination' } }, detail: { height: 0 } })
  assert.equal(page.data.focusedSearchField, '', 'dismissing the keyboard must not refocus a recreated sheet input')
  page.handleDismissKeyboard()
  assert.equal(page.data.sheetGeometry.scrollHeight, fullHeight)
  page.handleKeyboardHeightChange({ currentTarget: { dataset: { field: 'destination' } }, detail: { height: 220 } })
  assert.equal(page.data.keyboardHeight, 0)
})

test('search focus waits for the expanded sheet to mount and is canceled by a newer browse action', () => {
  const runtime = createRuntime(true)
  const page = runtime.page()
  page.onLoad()
  page.handleOpenPlanner()
  assert.equal(page.data.focusedSearchField, '', 'the hidden field must not receive focus before rendering')
  page.handleBrowseRoutes()
  runtime.flushRendering()
  assert.equal(page.data.focusedSearchField, '')
  page.handleOpenPlanner()
  runtime.flushRendering()
  assert.equal(page.data.focusedSearchField, 'destination')
})

test('an unconfirmed exact picker has a placeholder so selecting the first real station is a change', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.handleExactStopChange({ currentTarget: { dataset: { field: 'origin' } }, detail: { value: '0' } })
  assert.equal(page.data.originMode, 'location')
  page.handleExactStopChange({ currentTarget: { dataset: { field: 'origin' } }, detail: { value: '1' } })
  assert.equal(page.data.originMode, 'stop')
  assert.equal(page.data.originIndex, 0)
})

test('planning from a focused confirmed input clears keyboard space before building the compact card', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad()
  page.handleOriginChange({ detail: { value: '0' } })
  page.handleDestinationChange({ detail: { value: '28' } })
  page.handleOpenPlanner()
  page.handleKeyboardHeightChange({ currentTarget: { dataset: { field: 'destination' } }, detail: { height: 250 } })
  page.handlePlanJourney()
  assert.equal(page.data.sheetSnap, 'peek')
  assert.equal(page.data.keyboardHeight, 0)
  assert.ok(page.data.sheetGeometry.scrollHeight >= 116, 'the compact route card must remain visible after keyboard dismissal')
})
