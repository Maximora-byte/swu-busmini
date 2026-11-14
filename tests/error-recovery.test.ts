import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

interface Navigation { url: string; success?(): void; fail?(error?: unknown): void }
interface RecoveryPage {
  data: { message: string; retrying: boolean; retryError: string }
  onLoad(query?: Record<string, unknown>): void
  onUnload?(): void
  handleRetry(): void
}
interface Application {
  onError?(error: unknown): void
  onUnhandledRejection?(event: unknown): void
  onPageNotFound?(event: unknown): void
}

// Only native App/Page/navigation boundaries are substituted; every project module executes.
function runtime() {
  const root = fileURLToPath(new URL('../miniprogram/', import.meta.url))
  const modules = new Map<string, { exports: unknown }>()
  const navigations: Navigation[] = [], modals: unknown[] = []
  let app: Application = {}, page: RecoveryPage | undefined, currentRoute = ''
  let throwNavigation = false, throwModal = false, unavailableDataset = false
  const privatePayload = {
    get reason(): never { throw new Error('raw rejection payload must not be read') },
    get path(): never { throw new Error('raw page path must not be read') },
    toString(): never { throw new Error('raw errors must not be stringified') },
  }
  function load(relativePath: string): unknown {
    const path = resolve(root, relativePath)
    assert.ok(path.startsWith(root))
    if (modules.has(path)) return modules.get(path)!.exports
    assert.ok(existsSync(path), `missing recovery implementation: ${relativePath}`)
    const module = { exports: {} as unknown }
    modules.set(path, module)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, fileName: path,
    }).outputText
    runInNewContext(code, {
      module, exports: module.exports,
      require(specifier: string) {
        assert.ok(specifier.startsWith('.'), 'recovery has no external runtime dependency')
        if (unavailableDataset && specifier.endsWith('/repository/current-transit.repository')) throw privatePayload
        const dependency = resolve(dirname(path), `${specifier}.ts`)
        assert.ok(!dependency.includes(`${resolve(root, 'data')}`), 'recovery works without datasets')
        return load(dependency)
      },
      App(value: Application) { app = value },
      Page(value: RecoveryPage) {
        page = Object.assign(value, { setData(update: object) { Object.assign(value.data, update) } })
      },
      getCurrentPages() { return currentRoute ? [{ route: currentRoute }] : [] },
      wx: {
        reLaunch(options: Navigation) {
          if (throwNavigation) throw privatePayload
          navigations.push(options)
        },
        showModal(options: unknown) { if (throwModal) throw privatePayload; modals.push(options) },
      },
      console: new Proxy({}, { get() { throw new Error('no raw errors or telemetry may be logged') } }),
    }, { filename: path, timeout: process.env.NODE_V8_COVERAGE ? 5000 : 1000 })
    return module.exports
  }
  load('app.ts')
  return {
    app, privatePayload, navigations, modals,
    route(value: string) { currentRoute = value },
    throwNavigation(value = true) { throwNavigation = value },
    throwModal() { throwModal = true },
    startupWithUnavailableDataset() {
      unavailableDataset = true
      // Emulate the native runtime dispatching a page-import failure to the registered App hook.
      try { load('pages/journey/journey.ts') } catch (error) { app.onError?.(error) }
      assert.equal(page, undefined, 'homepage failed before Page registration')
    },
    page() {
      load('pages/recovery/recovery.ts')
      assert.ok(page)
      currentRoute = 'pages/recovery/recovery'
      return page
    },
  }
}

test('global hooks navigate startup errors, rejected promises and missing pages using only fixed reason codes', () => {
  for (const [hook, reason] of [['onError', 'runtime'], ['onUnhandledRejection', 'promise'], ['onPageNotFound', 'page-not-found']] as const) {
    const r = runtime()
    assert.equal(typeof r.app[hook], 'function', `App registers ${hook} before page imports`)
    r.app[hook]!(r.privatePayload)
    assert.equal(r.navigations.length, 1)
    assert.equal(r.navigations[0].url, `/pages/recovery/recovery?reason=${reason}`)
  }
})

test('concurrent errors and errors on the recovery page never create recursive redirects', () => {
  const r = runtime()
  assert.equal(typeof r.app.onError, 'function')
  r.app.onError!(r.privatePayload)
  r.app.onUnhandledRejection!(r.privatePayload)
  r.app.onPageNotFound!(r.privatePayload)
  assert.equal(r.navigations.length, 1)
  r.navigations[0].success?.()
  r.route('pages/recovery/recovery')
  r.app.onError!(r.privatePayload)
  assert.equal(r.navigations.length, 1)

  const direct = runtime()
  direct.route('pages/recovery/recovery')
  direct.app.onPageNotFound!(direct.privatePayload)
  assert.equal(direct.navigations.length, 0)
})

test('successful recovery navigation does not suppress future errors after an independent return home', () => {
  const r = runtime()
  r.app.onError!(r.privatePayload)
  r.route('pages/recovery/recovery')
  r.navigations[0].success?.()
  r.app.onError!(r.privatePayload)
  assert.equal(r.navigations.length, 1, 'current recovery page still prevents recursion')
  r.route('pages/journey/journey')
  r.app.onError!(r.privatePayload)
  assert.equal(r.navigations.length, 2, 'a new error after independent home navigation still recovers')
  assert.equal(r.navigations[1].url, '/pages/recovery/recovery?reason=runtime')
})

test('a homepage data-import failure reaches the already registered global fallback and the data-free recovery page still loads', () => {
  const r = runtime()
  r.startupWithUnavailableDataset()
  assert.equal(r.navigations.length, 1)
  assert.equal(r.navigations[0].url, '/pages/recovery/recovery?reason=runtime')
  const page = r.page()
  page.onLoad({ reason: 'runtime' })
  assert.match(page.data.message, /首页/)
  page.handleRetry()
  assert.equal(r.navigations[1].url, '/pages/journey/journey?view=map')
})

test('failed native recovery navigation has one safe restart prompt and contains secondary errors', () => {
  const r = runtime()
  assert.equal(typeof r.app.onError, 'function')
  r.app.onError!(r.privatePayload)
  r.navigations[0].fail?.(r.privatePayload)
  r.app.onError!(r.privatePayload)
  assert.equal(r.navigations.length, 1)
  assert.equal(r.modals.length, 1)
  assert.match(JSON.stringify(r.modals), /重新打开/)

  const throwing = runtime()
  throwing.throwNavigation()
  throwing.throwModal()
  assert.doesNotThrow(() => throwing.app.onError!(throwing.privatePayload))
  assert.doesNotThrow(() => throwing.app.onError!(throwing.privatePayload))
})

test('recovery page drops arbitrary query values and retries only the fixed homepage once per pending navigation', () => {
  const r = runtime(), page = r.page()
  page.onLoad({ reason: 'token=private&latitude=12&search=private', path: '/private' })
  assert.match(page.data.message, /暂时/)
  assert.doesNotMatch(JSON.stringify(page.data), /private|latitude|token/)
  page.handleRetry()
  page.handleRetry()
  assert.equal(r.navigations.length, 1)
  assert.equal(r.navigations[0].url, '/pages/journey/journey?view=map')
  assert.equal(page.data.retrying, true)
  r.navigations[0].fail?.(r.privatePayload)
  assert.equal(page.data.retrying, false)
  assert.match(page.data.retryError, /重试/)
  page.handleRetry()
  assert.equal(r.navigations.length, 2)
  r.navigations[1].success?.()
  assert.equal(page.data.retrying, false)
  r.route('pages/journey/journey')
  r.app.onError!(r.privatePayload)
  assert.equal(r.navigations[2].url, '/pages/recovery/recovery?reason=runtime')
})

test('recovery retry contains synchronous native failures and stays actionable', () => {
  const r = runtime(), page = r.page()
  page.onLoad({ reason: 'page-not-found' })
  assert.match(page.data.message, /页面/)
  r.throwNavigation()
  assert.doesNotThrow(() => page.handleRetry())
  assert.equal(page.data.retrying, false)
  assert.match(page.data.retryError, /重试/)
  r.throwNavigation(false)
  page.handleRetry()
  assert.equal(r.navigations.length, 1)
})

test('deferred navigation callbacks never write recovery state after the page unloads', () => {
  for (const outcome of ['success', 'fail'] as const) {
    const r = runtime(), page = r.page()
    page.onLoad()
    page.handleRetry()
    const dataAtUnload = JSON.stringify(page.data)
    assert.equal(typeof page.onUnload, 'function', 'pending retry callbacks are invalidated on unload')
    page.onUnload!()
    r.route('pages/journey/journey')
    r.navigations[0][outcome]?.()
    assert.equal(JSON.stringify(page.data), dataAtUnload, `no ${outcome} callback update after unload`)
    r.app.onError!(r.privatePayload)
    assert.equal(r.navigations.length, 2, 'an old retry callback cannot permanently suppress later recovery')
  }
})
