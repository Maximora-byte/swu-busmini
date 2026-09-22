import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { dataAdapters, syncDataAdapters } from '../scripts/data-adapter'

async function fixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'swu-data-sync-'))
  await Promise.all(dataAdapters.map(({ file }) =>
    writeFile(join(directory, `${file}.json`), '[]\n', 'utf8'),
  ))
  return directory
}

test('check detects missing/stale adapters without writing and sync repairs them', async () => {
  const directory = await fixture()
  assert.equal((await syncDataAdapters(directory, true)).length, 5)
  await assert.rejects(readFile(join(directory, 'stops.ts')), { code: 'ENOENT' })
  await syncDataAdapters(directory, false)
  assert.deepEqual(await syncDataAdapters(directory, true), [])
  const before = await readFile(join(directory, 'stops.ts'), 'utf8')
  await writeFile(join(directory, 'stops.json'), '[{"id":"fixture_stop"}]')
  assert.deepEqual(await syncDataAdapters(directory, true), ['stops.ts'])
  assert.equal(await readFile(join(directory, 'stops.ts'), 'utf8'), before)
  await syncDataAdapters(directory, false)
  assert.match(await readFile(join(directory, 'stops.ts'), 'utf8'), /fixture_stop/)
  assert.deepEqual(await syncDataAdapters(directory, false), [])
})

test('invalid JSON prevents all adapter writes', async () => {
  const directory = await fixture()
  await syncDataAdapters(directory, false)
  const before = await readFile(join(directory, 'stops.ts'), 'utf8')
  await writeFile(join(directory, 'stops.json'), '[{"id":"changed"}]')
  await writeFile(join(directory, 'route-geometries.json'), '{')
  await assert.rejects(syncDataAdapters(directory, false))
  assert.equal(await readFile(join(directory, 'stops.ts'), 'utf8'), before)
})
