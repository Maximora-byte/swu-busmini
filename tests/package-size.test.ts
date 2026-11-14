import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { collectBuildInput, createEvidence, checkEvidence, verifyBuildProject } from '../scripts/package-size'

const now = new Date('2026-11-14T01:00:00.000Z')
const receipt = { size: { total: 271377, packages: [{ name: 'TOTAL', size: 271377 }] } }
const metadata = {
  operation: 'preview' as const,
  toolVersion: '2.01.2510280',
  buildVersion: '0.1.0',
  capturedAt: now.toISOString(),
}

function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'swubus-package-size-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'miniprogram'))
  writeFileSync(join(root, 'miniprogram/app.json'), '{"pages":["pages/index"]}\n')
  writeFileSync(join(root, 'miniprogram/app.ts'), 'App({})\n')
  writeFileSync(join(root, 'miniprogram/icon.png'), Buffer.from([137, 80, 78, 71, 13, 10, 0, 255]))
  writeFileSync(join(root, 'project.config.json'), JSON.stringify({
    appid: 'touristappid', compileType: 'miniprogram', miniprogramRoot: 'miniprogram/',
    libVersion: '3.7.12', setting: { es6: true, minified: true },
  }))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  git('init', '--quiet')
  git('config', 'core.autocrlf', 'false')
  git('add', '.')
  return { root, git, input: () => collectBuildInput(root) }
}

test('records official compiled sizes and strips all private receipt fields', t => {
  const { input } = fixture(t)
  const result = createEvidence({ ...receipt, appid: 'private-app', qr: 'private-qr', path: 'private-path' }, input(), metadata)
  assert.equal(result.size.total, 271377)
  assert.equal(result.source, 'wechat-devtools-preview-info-output')
  assert.equal(result.profile.kind, 'single-main')
  assert.doesNotMatch(JSON.stringify(result), /private-|appid|qr|path/)
  assert.doesNotThrow(() => checkEvidence(result, input(), now))
})

test('rejects missing sizes, coercion, invalid totals and unsupported package layouts', t => {
  const { input } = fixture(t)
  for (const invalid of [
    {}, { size: {} }, { size: { total: '271377', packages: receipt.size.packages } },
    ...[0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].map(total => ({ size: { total, packages: [{ name: 'TOTAL', size: total }] } })),
    { size: { total: 271377, packages: [{ name: 'TOTAL', size: 271378 }] } },
    { size: { total: 271377, packages: [] } },
    { size: { total: 271377, packages: [{ name: 'subpackage', size: 271377 }] } },
    { size: { total: 271377, packages: [...receipt.size.packages, { name: 'other', size: 1 }] } },
  ]) assert.throws(() => createEvidence(invalid, input(), metadata), /size|package/i)
})

test('does not record a failed official operation even if an error payload contains sizes', t => {
  const { input } = fixture(t)
  for (const failure of [{ errCode: 10 }, { errcode: 10 }, { code: 10 }, { success: false }, { error: 'private failure detail' }]) {
    assert.throws(() => createEvidence({ ...receipt, ...failure }, input(), metadata), /failed.*receipt/i)
  }
})

test('enforces internal 512 KiB budget including one-byte overflow', t => {
  const { input } = fixture(t)
  const atLimit = { size: { total: 524288, packages: [{ name: 'TOTAL', size: 524288 }] } }
  assert.doesNotThrow(() => checkEvidence(createEvidence(atLimit, input(), metadata), input(), now))
  const over = { size: { total: 524289, packages: [{ name: 'TOTAL', size: 524289 }] } }
  assert.throws(() => createEvidence(over, input(), metadata), /budget/i)
})

test('rejects future capture times and malformed evidence without expiring unchanged build inputs', t => {
  const { input } = fixture(t)
  const evidence = createEvidence(receipt, input(), metadata)
  assert.doesNotThrow(() => checkEvidence(evidence, input(), new Date('2026-12-15T01:00:00.000Z')))
  assert.throws(() => checkEvidence(evidence, input(), new Date('2026-11-13T01:00:00.000Z')), /future/i)
  for (const invalid of [
    null, {}, { ...evidence, source: 'source-directory-size' },
    { ...evidence, size: { ...evidence.size, total: 1 } },
    { ...evidence, capturedAt: 'not-a-date' },
    { ...evidence, toolVersion: '../../private' },
    { ...evidence, buildVersion: 'secret-token' },
    { ...evidence, appid: 'private-app' },
    { ...evidence, profile: { ...evidence.profile, kind: 'subpackages' } },
    { ...evidence, inputSha256: '0'.repeat(64) },
  ]) assert.throws(() => checkEvidence(invalid, input(), now))
})

test('staged runtime changes invalidate evidence and unstaged runtime changes cannot be recorded', t => {
  const { root, git, input } = fixture(t)
  const evidence = createEvidence(receipt, input(), metadata)
  writeFileSync(join(root, 'miniprogram/app.ts'), 'App({changed: true})\n')
  assert.throws(input, /staged|index/i)
  git('add', 'miniprogram/app.ts')
  assert.throws(() => checkEvidence(evidence, input(), now), /fingerprint|input/i)
})

test('fingerprint ignores AppID but changes for public compiler settings', t => {
  const { root, git, input } = fixture(t)
  const before = input()
  const configPath = join(root, 'project.config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  config.appid = 'private-app-id'
  writeFileSync(configPath, JSON.stringify(config))
  git('add', 'project.config.json')
  assert.deepEqual(input(), before)
  config.setting.minified = false
  writeFileSync(configPath, JSON.stringify(config))
  git('add', 'project.config.json')
  assert.notEqual(input().inputSha256, before.inputSha256)
})

test('fingerprint normalizes text CRLF, preserves binary and ignores files outside runtime', t => {
  const { root, git, input } = fixture(t)
  const before = input()
  writeFileSync(join(root, 'miniprogram/app.ts'), 'App({})\r\n')
  writeFileSync(join(root, 'unrelated.md'), 'ignored for runtime fingerprint')
  assert.deepEqual(input(), before)
  writeFileSync(join(root, 'miniprogram/icon.png'), Buffer.from([137, 80, 78, 71, 10, 0, 255]))
  git('add', 'miniprogram/icon.png')
  assert.notEqual(input().inputSha256, before.inputSha256)
})

test('rejects untracked and ignored runtime files plus unsupported subpackages', t => {
  const { root, git, input } = fixture(t)
  writeFileSync(join(root, '.gitignore'), 'miniprogram/private.ts\n')
  writeFileSync(join(root, 'miniprogram/private.ts'), 'private')
  assert.throws(input, /untracked/i)
  rmSync(join(root, 'miniprogram/private.ts'))
  writeFileSync(join(root, 'miniprogram/app.json'), '{"pages":[],"subPackages":[{"root":"extra"}]}')
  git('add', 'miniprogram/app.json')
  assert.throws(input, /subpackage/i)
})

test('verifies actual candidate bytes and compile settings while allowing only AppID replacement', t => {
  const { root, input } = fixture(t)
  const candidate = mkdtempSync(join(tmpdir(), 'swubus-candidate-'))
  t.after(() => rmSync(candidate, { recursive: true, force: true }))
  cpSync(join(root, 'miniprogram'), join(candidate, 'miniprogram'), { recursive: true })
  const config = JSON.parse(readFileSync(join(root, 'project.config.json'), 'utf8'))
  const writeConfig = () => writeFileSync(join(candidate, 'project.config.json'), JSON.stringify(config))
  config.appid = 'private-candidate-appid'
  writeConfig()
  assert.deepEqual(verifyBuildProject(root, candidate), input())
  writeFileSync(join(candidate, 'miniprogram/app.ts'), 'App({wrong: true})')
  assert.throws(() => verifyBuildProject(root, candidate), /candidate|input/i)
  cpSync(join(root, 'miniprogram/app.ts'), join(candidate, 'miniprogram/app.ts'))
  config.setting.minified = false
  writeConfig()
  assert.throws(() => verifyBuildProject(root, candidate), /candidate|profile/i)
  config.setting.minified = true
  writeConfig()
  writeFileSync(join(candidate, 'project.private.config.json'), '{}')
  assert.throws(() => verifyBuildProject(root, candidate), /private.*config/i)
})

test('CLI fails closed without receipt/evidence and records only sanitized verified inputs', t => {
  const { root, input } = fixture(t)
  mkdirSync(join(root, 'release'))
  const cli = (...args: string[]) => spawnSync(process.execPath, [
    resolve('node_modules/tsx/dist/cli.mjs'), resolve('scripts/package-size.ts'), ...args,
  ], { cwd: root, encoding: 'utf8' })
  assert.equal(cli('check').status, 1)
  const receiptPath = join(root, 'private-receipt.json')
  const evidencePath = join(root, 'release/package-size.json')
  const args = ['record', '--receipt', receiptPath, '--project', root, '--tool-version', '2.02.0',
    '--build-version', '0.1.0', '--input-sha256', input().inputSha256, '--operation', 'preview']
  const absent = cli(...args)
  assert.equal(absent.status, 1)
  assert.doesNotMatch(absent.stdout + absent.stderr, /private-receipt|swubus-package-size-/)
  writeFileSync(receiptPath, JSON.stringify({ ...receipt, appid: 'private-token', qr: 'private-token' }))
  const wrongHash = [...args]
  wrongHash[wrongHash.indexOf('--input-sha256') + 1] = '0'.repeat(64)
  assert.equal(cli(...wrongHash).status, 1)
  assert.throws(() => readFileSync(evidencePath))
  const recorded = cli(...args)
  assert.equal(recorded.status, 0, recorded.stderr)
  assert.doesNotMatch(readFileSync(evidencePath, 'utf8') + recorded.stdout + recorded.stderr, /private-token|private-receipt|swubus-package-size-/)
  const checked = cli('check')
  assert.equal(checked.status, 0, checked.stderr)
  assert.match(checked.stdout, /does not independently compile/)
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
  evidence.appid = 'private-token'
  writeFileSync(evidencePath, JSON.stringify(evidence))
  const rejected = cli('check')
  assert.equal(rejected.status, 1)
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /private-token/)
})
