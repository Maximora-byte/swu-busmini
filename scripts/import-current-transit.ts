import { readFile } from 'node:fs/promises'
import { importCurrentTransitData, syncCurrentTransitData } from './current-transit-data'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0 || (args.length === 1 && args[0] === '--check')) {
    await syncCurrentTransitData(undefined, args[0] === '--check')
  } else if (args.length === 2 && args.every((arg) => !arg.startsWith('--'))) {
    const [stations, geometry] = await Promise.all(args.map(async (path) => JSON.parse(await readFile(path, 'utf8')) as unknown))
    await importCurrentTransitData(stations, geometry)
  } else throw new Error('Usage: import-current-transit [--check | station-snapshot.json geometry-snapshot.json]')
  console.log('Current transit static data synchronized; source identities are excluded from public outputs.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Current transit import failed')
  process.exitCode = 1
})
