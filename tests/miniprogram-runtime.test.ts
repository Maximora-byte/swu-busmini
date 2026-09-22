import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import type { Coordinate } from '../miniprogram/models/index'
import type { RawLocation } from '../miniprogram/services/location/location.service'
import type { RouteNavigationService } from '../miniprogram/services/navigation/route-navigation.service'
import { BEIBEI_VIEWPORT, CAMPUS_VIEWPORT } from '../miniprogram/services/map/map-viewport.service'
import type { NavigationPlan } from '../miniprogram/services/navigation/navigation-planner.service'

interface RuntimePageData {
  activeTab: string
  navigationPlaces: { id: string; name: string }[]
  navigationPlans: NavigationPlan[]
  navigationMessage: string
  originIndex: number
  destinationIndex: number
  latitude: number
  longitude: number
  scale: number
  hasLocation: boolean
  locationStatusKind: string
  selectedRouteId: string
  routeDirections: { id: string; selected: boolean }[]
  routeStops: { id: string }[]
  routeDataErrorText: string
  routeDetailsExpanded: boolean
}

interface SelectionEvent {
  currentTarget: { dataset: { routeId?: string; directionId?: string } }
}

interface RuntimePage {
  handleTabChange(event: { currentTarget: { dataset: { tab: string } } }): void
  handleOriginChange(event: { detail: { value: string } }): void
  handleDestinationChange(event: { detail: { value: string } }): void
  handlePlanNavigation(): void
  handleOpenNavigationRoute(event: { currentTarget: { dataset: { planId: string } } }): void
  data: RuntimePageData
  cameraRequestVersion: number
  setData(update: Partial<RuntimePageData>): void
  onLoad(): void
  onReady(): void
  loadRoute(routeId: string, directionId?: string): void
  locateUser(moveCamera?: boolean): Promise<void>
  handleCampusOverview(): void
  handleBeibeiOverview(): void
  handleRouteChange(event: SelectionEvent): void
  handleDirectionChange(event: SelectionEvent): void
  toggleRouteDetails(): void
}

function createRuntime(location?: RawLocation, deferLocation = false) {
  const root = fileURLToPath(new URL('../miniprogram/', import.meta.url))
  const modules = new Map<string, { exports: unknown }>()
  const cameraMoves: Coordinate[] = []
  const boundaries: { southwest: Coordinate; northeast: Coordinate }[] = []
  const locationRequests: string[] = []
  const pendingLocations: ((result: RawLocation) => void)[] = []
  let page: RuntimePage | undefined
  // 只提供本地定位和地图镜头 API，故意不提供 wx.request。
  const platform = location ? {
    getSetting(options: { success(result: { authSetting: Record<string, boolean> }): void }) {
      options.success({ authSetting: { 'scope.userLocation': true } })
    },
    getLocation(options: { type: string; success(result: RawLocation): void }) {
      locationRequests.push(options.type)
      if (deferLocation) pendingLocations.push(options.success)
      else options.success(location)
    },
    createMapContext(mapId: string) {
      assert.equal(mapId, 'campus-map')
      return {
        moveToLocation(coordinate: Coordinate) {
          cameraMoves.push({ latitude: coordinate.latitude, longitude: coordinate.longitude })
        },
        setBoundary(boundary: { southwest: Coordinate; northeast: Coordinate }) {
          boundaries.push(boundary)
        },
      }
    },
  } : undefined

  // 模拟小程序的 JS 模块加载边界，禁止 Node 的 JSON 加载器掩盖运行时错误。
  function load(path: string): unknown {
    assert.ok(path.startsWith(root), 'runtime dependency must stay inside miniprogram')
    const cached = modules.get(path)
    if (cached) return cached.exports
    const source = readFileSync(path, 'utf8')
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: path,
    }).outputText
    const module: { exports: unknown } = { exports: {} }
    modules.set(path, module)
    runInNewContext(code, {
      module,
      exports: module.exports,
      require(specifier: string): unknown {
        assert.ok(specifier.startsWith('.'), `unsupported runtime module: ${specifier}`)
        assert.ok(!specifier.endsWith('.json'), `JSON runtime import: ${specifier}`)
        assert.ok(!specifier.includes('config.local'), 'local secrets cannot enter runtime')
        return load(resolve(dirname(path), `${specifier}.ts`))
      },
      Page(configuration: Omit<RuntimePage, 'setData'>) {
        page = Object.assign(configuration, {
          setData(this: RuntimePage, update: Partial<RuntimePageData>) {
            Object.assign(this.data, update)
          },
        })
      },
      ...(platform ? { wx: platform } : {}),
    }, { filename: path, timeout: 1000 })
    return module.exports
  }
  return {
    modules,
    cameraMoves,
    boundaries,
    locationRequests,
    resolveLocation() {
      const success = pendingLocations.shift()
      assert.ok(success, 'a location request must be pending')
      assert.ok(location)
      success(location)
    },
    load: (path: string) => load(resolve(root, path)),
    getPage() {
      assert.ok(page, 'Page must register before interacting with it')
      return page
    },
  }
}

test('page and nine-route navigation load with JS-only dependencies and no network', () => {
  const runtime = createRuntime()
  runtime.load('pages/index/index.ts')
  assert.ok(runtime.getPage())
  const navigationModule = runtime.load('services/navigation/route-navigation.service.ts') as {
    routeNavigationService: RouteNavigationService
  }
  const service = navigationModule.routeNavigationService
  assert.equal(service.getRoutes().length, 9)
  for (const route of service.getRoutes()) {
    for (const direction of service.getDirections(route.routeId)) {
      const view = service.getRouteNavigation(route.routeId, direction.directionId)
      assert.equal(view.routeId, route.routeId)
      assert.equal(view.directionId, direction.directionId)
      assert.ok(view.stops.length > 0)
    }
  }
  assert.ok([...runtime.modules.keys()].some((path) => path.endsWith(`${sep}coordinate-reviews.ts`)))
})

test('initial page location preserves campus overview and manual location moves to the local fix', async () => {
  const location = { latitude: 29.82, longitude: 106.42, accuracy: 10 }
  const runtime = createRuntime(location)
  runtime.load('pages/index/index.ts')
  const page = runtime.getPage()
  page.onLoad()
  page.onReady()
  // onLoad 启动异步定位但不返回 Promise；等本轮微任务结束后检查实际页面状态。
  await new Promise<void>((resolve) => setImmediate(resolve))

  assert.equal(page.data.hasLocation, true)
  assert.equal(page.data.locationStatusKind, 'success')
  assert.equal(page.data.latitude, CAMPUS_VIEWPORT.center.latitude)
  assert.equal(page.data.longitude, CAMPUS_VIEWPORT.center.longitude)
  assert.equal(page.data.scale, CAMPUS_VIEWPORT.scale)
  assert.equal(runtime.cameraMoves.length, 0)
  assert.deepEqual(runtime.locationRequests, ['gcj02'])
  assert.equal(runtime.boundaries[0].southwest.latitude, BEIBEI_VIEWPORT.southwest.latitude)
  assert.equal(runtime.boundaries[0].northeast.longitude, BEIBEI_VIEWPORT.northeast.longitude)

  await page.locateUser()
  assert.equal(page.data.latitude, location.latitude)
  assert.equal(page.data.longitude, location.longitude)
  assert.equal(page.data.scale, 17)
  assert.deepEqual(runtime.cameraMoves, [{ latitude: location.latitude, longitude: location.longitude }])

  page.toggleRouteDetails()
  assert.equal(page.data.routeDetailsExpanded, true)
  page.handleCampusOverview()
  assert.equal(page.data.routeDetailsExpanded, false)
  assert.equal(page.data.scale, CAMPUS_VIEWPORT.scale)
  assert.deepEqual(runtime.cameraMoves[1], CAMPUS_VIEWPORT.center)
  page.handleBeibeiOverview()
  assert.equal(page.data.scale, BEIBEI_VIEWPORT.scale)
  assert.deepEqual(runtime.cameraMoves[2], BEIBEI_VIEWPORT.center)
  // 中心值相同仍必须调用地图 API，以支持用户拖动地图后再次回到校园。
  page.handleCampusOverview()
  assert.equal(runtime.cameraMoves.length, 4)
  assert.equal(page.data.hasLocation, true)
})

test('out-of-area location keeps the campus view and route/direction selection preserves location', async () => {
  const runtime = createRuntime({ latitude: 39.9, longitude: 116.4, accuracy: 20 })
  runtime.load('pages/index/index.ts')
  const page = runtime.getPage()
  await page.locateUser()
  assert.equal(page.data.locationStatusKind, 'warning')
  assert.equal(page.data.latitude, CAMPUS_VIEWPORT.center.latitude)
  assert.equal(page.data.longitude, CAMPUS_VIEWPORT.center.longitude)
  assert.equal(page.data.scale, CAMPUS_VIEWPORT.scale)
  assert.deepEqual(runtime.cameraMoves, [CAMPUS_VIEWPORT.center])

  page.handleRouteChange({ currentTarget: { dataset: { routeId: 'route_6' } } })
  assert.equal(page.data.selectedRouteId, 'route_6')
  assert.equal(page.data.routeDataErrorText, '')
  assert.equal(page.data.hasLocation, true)
  assert.equal(page.data.routeStops[2].id, 'meiyuan')
  const reverse = page.data.routeDirections[1].id
  page.handleDirectionChange({ currentTarget: { dataset: { directionId: reverse } } })
  assert.equal(page.data.routeDirections[1].selected, true)
  assert.equal(page.data.routeStops[2].id, 'building_8')
  assert.equal(page.data.hasLocation, true)
  assert.equal(runtime.cameraMoves.length, 1)
})

test('navigation tab queries destinations and opens the matched direction without losing location', async () => {
  const runtime = createRuntime({ latitude: 29.82, longitude: 106.42, accuracy: 10 })
  runtime.load('pages/index/index.ts')
  const page = runtime.getPage()
  page.onLoad()
  await new Promise<void>((resolve) => setImmediate(resolve))
  page.handleTabChange({ currentTarget: { dataset: { tab: 'navigation' } } })
  page.handlePlanNavigation()
  assert.equal(page.data.navigationPlans.length, 2)
  assert.ok(page.data.navigationPlans.every((plan) => plan.routeId === 'route_9'))
  const gateIndex = page.data.navigationPlaces.findIndex((place) => place.id === 'poi:gate_5')
  assert.ok(gateIndex >= 0)
  page.handleOriginChange({ detail: { value: String(gateIndex + 1) } })
  assert.equal(page.data.navigationPlans.length, 0)
  page.handlePlanNavigation()
  assert.equal(page.data.navigationPlans.length, 1)
  const plan = page.data.navigationPlans[0]
  assert.equal(plan.pathText, '五号门 → 橘园 → 梅园 → 中心图书馆')
  page.handleOpenNavigationRoute({ currentTarget: { dataset: { planId: plan.id } } })
  assert.equal(page.data.activeTab, 'map')
  assert.equal(page.data.selectedRouteId, 'route_9')
  assert.ok(page.data.routeDirections.some((direction) => direction.id === plan.directionId && direction.selected))
  assert.equal(page.data.routeDetailsExpanded, true)
  assert.equal(page.data.hasLocation, true)
  page.handleDestinationChange({ detail: { value: String(gateIndex) } })
  assert.equal(page.data.navigationPlans.length, 0)
  page.handlePlanNavigation()
  assert.equal(page.data.navigationPlans.length, 0)
  assert.match(page.data.navigationMessage, /起点和终点相同/)
})

test('a pending manual location updates position without overriding a newer overview choice', async () => {
  const runtime = createRuntime({ latitude: 29.82, longitude: 106.42, accuracy: 10 }, true)
  runtime.load('pages/index/index.ts')
  const page = runtime.getPage()
  assert.equal(page.cameraRequestVersion, 0)
  const locating = page.locateUser()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(page.data.hasLocation, false)

  page.handleBeibeiOverview()
  runtime.resolveLocation()
  await locating

  assert.equal(page.data.hasLocation, true)
  assert.equal(page.data.locationStatusKind, 'success')
  assert.equal(page.data.scale, BEIBEI_VIEWPORT.scale)
  assert.equal(page.data.latitude, BEIBEI_VIEWPORT.center.latitude)
  assert.equal(page.data.longitude, BEIBEI_VIEWPORT.center.longitude)
  assert.deepEqual(runtime.cameraMoves, [BEIBEI_VIEWPORT.center])
})
