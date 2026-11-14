import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import policy from '../release/package-size-policy.json'

interface BuildProfile {
  kind: 'single-main'
  compileType: 'miniprogram'
  libVersion: string
  configSha256: string
}

export interface BuildInput {
  inputSha256: string
  profile: BuildProfile
}

interface Metadata {
  operation: 'preview' | 'upload'
  toolVersion: string
  buildVersion: string
  capturedAt: string
}

interface PackageSize {
  total: number
  packages: [{ name: 'TOTAL'; size: number }]
}

export interface PackageEvidence extends BuildInput {
  schemaVersion: 1
  source: 'wechat-devtools-preview-info-output' | 'wechat-devtools-upload-info-output'
  capturedAt: string
  toolVersion: string
  buildVersion: string
  size: PackageSize
}

class PackageGateError extends Error {}

const textExtensions = new Set(['.ts', '.js', '.json', '.wxml', '.wxss', '.wxs', '.css', '.html', '.txt', '.svg', '.map', '.less', '.scss'])
const versionPattern = /^\d+(?:\.\d+){1,4}$/
const shaPattern = /^[a-f0-9]{64}$/

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PackageGateError(`Invalid ${name} object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: string[], name: string): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new PackageGateError(`Invalid ${name} fields`)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalize(path: string, bytes: Buffer): Buffer {
  if (!textExtensions.has(extname(path).toLowerCase())) return bytes
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  return Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8')
}

function runtimeFiles(root: string, relative = 'miniprogram'): string[] {
  const path = join(root, relative)
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw new PackageGateError('Runtime directory must not be a symlink')
  return readdirSync(path).flatMap(name => {
    const next = `${relative}/${name}`
    const stat = lstatSync(join(root, next))
    if (stat.isSymbolicLink()) throw new PackageGateError('Runtime symlinks are unsupported')
    if (stat.isDirectory()) return runtimeFiles(root, next)
    if (!stat.isFile()) throw new PackageGateError('Unsupported runtime file type')
    return [next]
  }).sort()
}

function publicConfig(bytes: Buffer): Record<string, unknown> {
  const { appid: _appid, ...config } = object(JSON.parse(bytes.toString('utf8')), 'project config')
  if (config.compileType !== 'miniprogram' || config.miniprogramRoot !== 'miniprogram/') {
    throw new PackageGateError('Only the miniprogram/ single-main compilation profile is supported')
  }
  if (typeof config.libVersion !== 'string' || !versionPattern.test(config.libVersion)) throw new PackageGateError('Invalid public library version')
  return config
}

function directoryInput(root: string, files: string[], config: Record<string, unknown>): BuildInput {
  const app = object(JSON.parse(readFileSync(join(root, 'miniprogram/app.json'), 'utf8')), 'app config')
  if ('subPackages' in app || 'subpackages' in app || app.plugins || app.independent) {
    throw new PackageGateError('Subpackages/plugins are unsupported by the single-main package profile')
  }
  const configSha256 = sha256(canonical(config))
  const profile: BuildProfile = { kind: 'single-main', compileType: 'miniprogram', libVersion: config.libVersion as string, configSha256 }
  const entries = files.map(path => [path, sha256(normalize(path, readFileSync(join(root, path))))])
  return { inputSha256: sha256(canonical({ algorithm: 'swubus-package-input-v1', profile, entries })), profile }
}

/** Hashes actual staged runtime inputs; directory bytes are never used as compiled package size. */
export function collectBuildInput(root: string): BuildInput {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  const tracked = git('ls-files', '--cached', '-z', '--', 'miniprogram/').toString('utf8').split('\0').filter(Boolean).sort()
  const files = runtimeFiles(root)
  if (!tracked.length || canonical(files) !== canonical(tracked)) throw new PackageGateError('Runtime contains untracked/ignored files or missing staged files')
  for (const path of files) {
    const staged = git('show', `:${path}`)
    if (!normalize(path, staged).equals(normalize(path, readFileSync(join(root, path))))) {
      throw new PackageGateError('Runtime differs from the staged index; stage all build inputs first')
    }
  }
  const config = publicConfig(readFileSync(join(root, 'project.config.json')))
  const stagedConfig = publicConfig(git('show', ':project.config.json'))
  if (canonical(config) !== canonical(stagedConfig)) throw new PackageGateError('Public project config differs from the staged index')
  return directoryInput(root, files, config)
}

/** The private build project may replace AppID only, with no private compile settings or extra runtime bytes. */
export function verifyBuildProject(root: string, project: string): BuildInput {
  const input = collectBuildInput(root)
  if (existsSync(join(project, 'project.private.config.json'))) throw new PackageGateError('Candidate private project config is unsupported')
  const config = publicConfig(readFileSync(join(project, 'project.config.json')))
  const candidate = directoryInput(project, runtimeFiles(project), config)
  if (canonical(candidate) !== canonical(input)) throw new PackageGateError('Candidate input/profile does not match staged runtime fingerprint')
  return input
}

function parseSize(raw: unknown, strict = false): PackageSize {
  const size = object(raw, 'size')
  if (strict) exactKeys(size, ['total', 'packages'], 'size')
  if (!Number.isSafeInteger(size.total) || (size.total as number) <= 0) throw new PackageGateError('Invalid positive integer package size')
  if (!Array.isArray(size.packages) || size.packages.length !== 1) throw new PackageGateError('Only one TOTAL package is supported')
  const main = object(size.packages[0], 'package size')
  if (strict) exactKeys(main, ['name', 'size'], 'package size')
  if (main.name !== 'TOTAL' || main.size !== size.total) throw new PackageGateError('TOTAL package size must equal total size')
  if ((size.total as number) > policy.internalBudgetBytes) throw new PackageGateError('Official package size exceeds internal 512 KiB budget')
  return { total: size.total as number, packages: [{ name: 'TOTAL', size: main.size as number }] }
}

export function createEvidence(raw: unknown, input: BuildInput, metadata: Metadata): PackageEvidence {
  if (!['preview', 'upload'].includes(metadata.operation)) throw new PackageGateError('Unsupported official build operation')
  const receipt = object(raw, 'official receipt')
  if (['errCode', 'errcode', 'code'].some(key => key in receipt && receipt[key] !== 0)
    || receipt.success === false || (receipt.error !== undefined && receipt.error !== null && receipt.error !== false && receipt.error !== '')) {
    throw new PackageGateError('Failed official operation receipt cannot become package evidence')
  }
  const evidence: PackageEvidence = {
    schemaVersion: 1,
    source: metadata.operation === 'preview' ? 'wechat-devtools-preview-info-output' : 'wechat-devtools-upload-info-output',
    capturedAt: metadata.capturedAt, toolVersion: metadata.toolVersion, buildVersion: metadata.buildVersion,
    inputSha256: input.inputSha256, profile: { ...input.profile },
    size: parseSize(receipt.size),
  }
  checkEvidence(evidence, input, new Date(metadata.capturedAt))
  return evidence
}

export function checkEvidence(raw: unknown, input: BuildInput, now = new Date()): void {
  const evidence = object(raw, 'package evidence')
  exactKeys(evidence, ['schemaVersion', 'source', 'capturedAt', 'toolVersion', 'buildVersion', 'inputSha256', 'profile', 'size'], 'evidence')
  if (evidence.schemaVersion !== 1 || !['wechat-devtools-preview-info-output', 'wechat-devtools-upload-info-output'].includes(evidence.source as string)) {
    throw new PackageGateError('Unsupported official evidence source/schema')
  }
  for (const field of ['toolVersion', 'buildVersion']) {
    if (typeof evidence[field] !== 'string' || (evidence[field] as string).length > 64 || !versionPattern.test(evidence[field] as string)) throw new PackageGateError(`Invalid ${field}`)
  }
  if (typeof evidence.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(evidence.capturedAt)) throw new PackageGateError('Invalid capture time')
  const captured = new Date(evidence.capturedAt)
  if (!Number.isFinite(captured.getTime()) || captured.toISOString() !== evidence.capturedAt || !Number.isFinite(now.getTime())) throw new PackageGateError('Invalid capture time')
  if (captured.getTime() - now.getTime() > 5 * 60 * 1000) throw new PackageGateError('Capture time is in the future')
  const profile = object(evidence.profile, 'compilation profile')
  exactKeys(profile, ['kind', 'compileType', 'libVersion', 'configSha256'], 'compilation profile')
  if (typeof evidence.inputSha256 !== 'string' || !shaPattern.test(evidence.inputSha256) || canonical(profile) !== canonical(input.profile) || evidence.inputSha256 !== input.inputSha256) {
    throw new PackageGateError('Package evidence input fingerprint/compilation profile is stale or mismatched')
  }
  parseSize(evidence.size, true)
}

function main(args: string[]): void {
  const [command, ...flags] = args
  const root = process.cwd()
  if (command === 'fingerprint' && flags.length === 0) {
    console.log(collectBuildInput(root).inputSha256)
    return
  }
  if (command === 'check' && flags.length === 0) {
    const input = collectBuildInput(root)
    const path = join(root, 'release/package-size.json')
    if (!existsSync(path)) throw new PackageGateError('Missing official package evidence; capture an official build and record it first')
    const evidence: unknown = JSON.parse(readFileSync(path, 'utf8'))
    checkEvidence(evidence, input)
    console.log('Captured official package evidence matches staged inputs and internal budget; CI does not independently compile or authenticate it.')
    return
  }
  if (command !== 'record' || flags.length % 2 !== 0) throw new PackageGateError('Expected record, check, or fingerprint command')
  const allowed = ['--receipt', '--project', '--tool-version', '--build-version', '--input-sha256', '--operation']
  const options = new Map<string, string>()
  for (let i = 0; i < flags.length; i += 2) {
    if (!allowed.includes(flags[i]) || options.has(flags[i]) || !flags[i + 1] || flags[i + 1].startsWith('--')) throw new PackageGateError('Invalid recorder arguments')
    options.set(flags[i], flags[i + 1])
  }
  if (allowed.some(flag => !options.has(flag))) throw new PackageGateError('Recorder requires receipt, project, tool-version, build-version, input-sha256, and operation')
  const input = verifyBuildProject(root, resolve(options.get('--project')!))
  if (input.inputSha256 !== options.get('--input-sha256')) throw new PackageGateError('Build input fingerprint changed since capture began')
  const receipt: unknown = JSON.parse(readFileSync(resolve(options.get('--receipt')!), 'utf8'))
  const evidence = createEvidence(receipt, input, {
    operation: options.get('--operation') as Metadata['operation'], toolVersion: options.get('--tool-version')!,
    buildVersion: options.get('--build-version')!, capturedAt: new Date().toISOString(),
  })
  writeFileSync(join(root, 'release/package-size.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(`Recorded sanitized official ${options.get('--operation')} package size: ${evidence.size.total} bytes (internal budget ${policy.internalBudgetBytes} bytes).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)) } catch (error) {
    // Paths, compiler output and receipt contents can contain secrets. Never echo raw errors.
    console.error(error instanceof PackageGateError ? error.message : 'Package evidence gate failed: missing/unreadable files, invalid JSON/text, or Git error. Private build details were not logged.')
    process.exitCode = 1
  }
}
