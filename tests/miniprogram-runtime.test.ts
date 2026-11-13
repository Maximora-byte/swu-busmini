import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

interface LegacyEntry {
  data: { targetUrl: string; redirectError: string }
  onLoad(query?: { routeId?: string; view?: string }): void
  handleRetry(): void
}
function createRuntime(failRedirect = false) {
  const root = fileURLToPath(new URL('../miniprogram/', import.meta.url))
  const modules = new Map<string, { exports: unknown }>()
  const redirects: string[] = []
  let locationCalls = 0
  let page: LegacyEntry | undefined
  function load(path: string): unknown {
    assert.ok(path.startsWith(root), 'runtime dependency stays within mini-program')
    if (modules.has(path)) return modules.get(path)!.exports
    const module = { exports: {} as unknown }
    modules.set(path, module)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: path,
    }).outputText
    runInNewContext(code, {
      module, exports: module.exports,
      require(specifier: string) {
        assert.ok(specifier.startsWith('.') && !specifier.endsWith('.json') && !specifier.includes('config.local'))
        return load(resolve(dirname(path), `${specifier}.ts`))
      },
      wx: {
        redirectTo(options: { url: string; fail?(): void }) { redirects.push(options.url); if (failRedirect) options.fail?.() },
        getSetting(options: { success(result: unknown): void }) { locationCalls += 1; options.success({ authSetting: { 'scope.userLocation': false } }) },
        getLocation() { locationCalls += 1 },
      },
      Page(configuration: LegacyEntry) {
        page = Object.assign(configuration, { setData(update: object) { Object.assign(configuration.data, update) } })
      },
    }, { filename: path, timeout: process.env.NODE_V8_COVERAGE ? 5000 : 1000 })
    return module.exports
  }
  return { redirects, load: (path: string) => load(resolve(root, path)),
    page() { load(resolve(root, 'pages/index/index.ts')); assert.ok(page); return page },
    locationCalls: () => locationCalls, modules }
}

test('legacy entry redirects to unified campus home without loading old planning or requesting GPS', () => {
  const runtime = createRuntime()
  runtime.page().onLoad()
  assert.deepEqual(runtime.redirects, ['/pages/journey/journey?view=map'])
  assert.equal(runtime.locationCalls(), 0)
  assert.equal(runtime.modules.size, 1, 'legacy UI must not instantiate a second planner')
})

test('legacy links preserve safe current route/view parameters and reject parameter injection', () => {
  const runtime = createRuntime()
  const page = runtime.page()
  page.onLoad({ routeId: 'route_3b', view: 'journey' })
  assert.equal(runtime.redirects[0], '/pages/journey/journey?view=journey&routeId=route_3b')
  page.onLoad({ routeId: 'route_1&view=journey', view: 'other' })
  assert.equal(runtime.redirects[1], '/pages/journey/journey?view=map')
})

test('failed redirect shows a retry path without resurrecting archived navigation', () => {
  const runtime = createRuntime(true)
  const page = runtime.page()
  page.onLoad()
  assert.match(page.data.redirectError, /重试/)
  page.handleRetry()
  assert.equal(runtime.redirects.length, 2)
  assert.equal(runtime.locationCalls(), 0)
})

test('historical route services remain JS-loadable for provenance and do not replace current data', () => {
  const runtime = createRuntime()
  const module = runtime.load('services/navigation/route-navigation.service.ts') as {
    routeNavigationService: { getRoutes(): { routeId: string }[]; getDirections(id: string): { directionId: string }[]; getRouteNavigation(id: string, direction: string): { stops: unknown[] } }
  }
  const service = module.routeNavigationService
  assert.equal(service.getRoutes().length, 9)
  for (const route of service.getRoutes()) for (const direction of service.getDirections(route.routeId)) {
    assert.ok(service.getRouteNavigation(route.routeId, direction.directionId).stops.length)
  }
  assert.equal(runtime.redirects.length, 0)
  assert.equal(runtime.locationCalls(), 0)
})
