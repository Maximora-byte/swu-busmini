import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = new URL('../miniprogram/components/privacy-consent/privacy-consent.ts', import.meta.url)
type Decision = { event: string; buttonId?: string }
type Resolver = (result: Decision) => void
type Instance = { data: { visible: boolean; contractName: string; contractError: string }; setData(update: Record<string, unknown>): void; [key: string]: any }

function runtime(options: { legacy?: boolean; missingContract?: boolean; settingFails?: boolean; contractFails?: boolean } = {}) {
  assert.ok(existsSync(source), 'privacy consent component must handle pending privacy requests')
  let definition: any
  let listener: ((resolve: Resolver) => void) | undefined
  const settingRequests: { success(result: { privacyContractName: string; needAuthorization: boolean }): void; fail(): void }[] = []
  let contractOpens = 0
  const wx: Record<string, unknown> = options.legacy ? {} : {
    onNeedPrivacyAuthorization(callback: typeof listener) { listener = callback },
    getPrivacySetting(callbacks: typeof settingRequests[number]) { settingRequests.push(callbacks) },
    ...(options.missingContract ? {} : { openPrivacyContract(callbacks: { fail(): void }) { contractOpens++; if (options.contractFails) callbacks.fail() } }),
  }
  runInNewContext(ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText,
    { Component(value: unknown) { definition = value }, wx, exports: {}, Set, WeakMap })
  function mount() {
    const instance: Instance = { data: { ...definition.data }, setData(update) { Object.assign(this.data, update) }, ...definition.methods }
    definition.lifetimes.attached.call(instance)
    return instance
  }
  const instance = mount()
  return { instance, mount, pending(resolve: Resolver) { assert.ok(listener); listener(resolve) },
    detach(target = instance) { definition.lifetimes.detached.call(target) },
    settings(name = '《SWUGo隐私保护指引》', needAuthorization = true) { const callback = settingRequests.shift(); assert.ok(callback); options.settingFails ? callback.fail() : callback.success({ privacyContractName: name, needAuthorization }) },
    contractOpens: () => contractOpens }
}

const agreeEvent = { type: 'agreeprivacyauthorization', currentTarget: { id: 'privacy-agree' } }

test('public pending state follows active ownership, resolution and detach', () => {
  const r = runtime()
  assert.equal(r.instance.hasPendingPrivacy(), false)
  r.pending(() => {})
  assert.equal(r.instance.hasPendingPrivacy(), true)
  r.instance.handleRefuse()
  assert.equal(r.instance.hasPendingPrivacy(), false)
  r.pending(() => {})
  const second = r.mount()
  assert.equal(r.instance.hasPendingPrivacy(), false)
  r.pending(() => {})
  assert.equal(second.hasPendingPrivacy(), true)
  second.handleAgree(agreeEvent)
  assert.equal(second.hasPendingPrivacy(), false)
  r.pending(() => {})
  r.detach(second)
  assert.equal(second.hasPendingPrivacy(), false)
})

test('privacy prompt waits for the native explicit agreement event, never settings or reading', () => {
  const r = runtime()
  const decisions: Decision[] = []
  assert.equal(r.instance.data.visible, false)
  r.pending(value => decisions.push(value))
  assert.equal(r.instance.data.visible, true)
  r.settings('《正式指引》', false)
  assert.equal(r.instance.data.contractName, '《正式指引》')
  r.instance.handleOpenContract()
  assert.equal(r.contractOpens(), 1)
  r.instance.handleAgree({ type: 'tap', currentTarget: { id: 'privacy-agree' } })
  r.instance.handleAgree({ type: 'agreeprivacyauthorization', currentTarget: { id: 'other' } })
  assert.equal(decisions.length, 0)
  r.instance.handleAgree(agreeEvent)
  assert.equal(decisions.length, 1)
  assert.equal(decisions[0].event, 'agree')
  assert.equal(decisions[0].buttonId, 'privacy-agree')
  assert.equal(r.instance.data.visible, false)
  r.instance.handleAgree(agreeEvent)
  r.instance.handleRefuse()
  assert.equal(decisions.length, 1)
})

test('one user refusal settles every concurrent request once and permits a fresh retry', () => {
  const r = runtime()
  const first: Decision[] = [], second: Decision[] = []
  const resolveFirst = (value: Decision) => first.push(value)
  r.pending(resolveFirst)
  r.pending(resolveFirst)
  r.pending(value => second.push(value))
  r.instance.handleRefuse()
  r.instance.handleRefuse()
  assert.equal(first.length, 1)
  assert.equal(second.length, 1)
  assert.equal(first[0].event, 'disagree')
  assert.equal(second[0].event, 'disagree')
  r.pending(value => first.push(value))
  assert.equal(r.instance.data.visible, true)
  r.instance.handleAgree(agreeEvent)
  assert.equal(first[1].event, 'agree')
})

test('native agreement event naming preserves compatibility with camel case callback events', () => {
  const r = runtime()
  const decisions: Decision[] = []
  r.pending(value => decisions.push(value))
  r.instance.handleAgree({ type: 'agreePrivacyAuthorization', currentTarget: { id: 'privacy-agree' } })
  assert.equal(decisions.length, 1)
  assert.equal(decisions[0].event, 'agree')
})

test('detaching rejects pending and late requests without retaining a dead prompt', () => {
  const r = runtime()
  const results: Decision[] = []
  r.pending(value => results.push(value))
  r.detach()
  r.settings('late contract')
  r.pending(value => results.push(value))
  r.instance.handleAgree(agreeEvent)
  assert.equal(results.length, 2)
  assert.ok(results.every(value => value.event === 'disagree'))
  assert.equal(r.instance.data.visible, false)
  assert.notEqual(r.instance.data.contractName, 'late contract')
})

test('replacing an owner rejects its pending calls and its detach cannot disable the new prompt', () => {
  const r = runtime()
  const old: Decision[] = [], current: Decision[] = []
  r.pending(value => old.push(value))
  const second = r.mount()
  assert.equal(old[0].event, 'disagree')
  r.detach()
  r.pending(value => current.push(value))
  assert.equal(second.data.visible, true)
  second.handleAgree(agreeEvent)
  assert.equal(current[0].event, 'agree')
})

test('resolver exceptions do not strand other callers or silently approve a reentrant request', () => {
  const r = runtime()
  const results: Decision[] = []
  r.pending(() => { throw new Error('caller already disposed') })
  r.pending(value => { results.push(value); r.pending(next => results.push(next)) })
  r.instance.handleRefuse()
  assert.equal(results.length, 1)
  assert.equal(r.instance.data.visible, true)
  r.instance.handleRefuse()
  assert.equal(results.length, 2)
  assert.ok(results.every(value => value.event === 'disagree'))
})

test('missing privacy APIs leave local browsing usable and failed contract opening gives a readable error', () => {
  const legacy = runtime({ legacy: true })
  assert.equal(legacy.instance.data.visible, false)
  legacy.detach()
  const r = runtime({ settingFails: true, contractFails: true })
  const result: Decision[] = []
  r.pending(value => result.push(value))
  r.settings()
  r.instance.handleOpenContract()
  assert.ok(r.instance.data.contractError.length > 0)
  assert.equal(result.length, 0)
  r.instance.handleRefuse()
  assert.equal(result[0].event, 'disagree')
  const unavailable = runtime({ missingContract: true })
  unavailable.instance.handleOpenContract()
  assert.ok(unavailable.instance.data.contractError.length > 0)
})
