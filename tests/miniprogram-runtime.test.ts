import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import type { RouteNavigationService } from '../miniprogram/services/navigation/route-navigation.service'

// 模拟小程序的 JS 模块加载边界，禁止 Node 的 JSON 加载器掩盖运行时错误。
test('page and nine-route navigation load with JS-only dependencies and no network', () => {
  const root = fileURLToPath(new URL('../miniprogram/', import.meta.url))
  const modules = new Map<string, { exports: unknown }>()
  let pageRegistered = false
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
      Page() { pageRegistered = true },
      // 不提供 wx.request 或 Node globals；静态线路查看不应调用它们。
    }, { filename: path, timeout: 1000 })
    return module.exports
  }
  load(resolve(root, 'pages/index/index.ts'))
  assert.equal(pageRegistered, true)
  const navigationModule = load(resolve(root, 'services/navigation/route-navigation.service.ts')) as {
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
  assert.ok([...modules.keys()].some((path) => path.endsWith(`${sep}coordinate-reviews.ts`)))
})
