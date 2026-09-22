import { readFile, writeFile } from 'node:fs/promises'
import type { RoutePreviewData } from '../miniprogram/services/map/route-preview.types'

const jsonUrl = new URL('../miniprogram/data/route-preview.json', import.meta.url)
const adapterUrl = new URL('../miniprogram/data/route-preview.ts', import.meta.url)

export function serializeRoutePreviewAdapter(data: unknown): string {
  return `import type { RoutePreviewData } from '../services/map/route-preview.types'\n\n/** Generated offline experiment. NOT verified campus bus geometry. */\nexport const routePreviewData: RoutePreviewData = ${JSON.stringify(data, null, 2)}\n`
}

/** Developer-only file writes; production runtime imports only the TypeScript adapter. */
export async function writeRoutePreviewData(data: RoutePreviewData): Promise<void> {
  await writeFile(jsonUrl, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await writeFile(adapterUrl, serializeRoutePreviewAdapter(data), 'utf8')
}

export async function syncRoutePreviewAdapter(checkOnly = false): Promise<void> {
  const data: unknown = JSON.parse(await readFile(jsonUrl, 'utf8'))
  const expected = serializeRoutePreviewAdapter(data)
  let current: string | undefined
  try {
    current = await readFile(adapterUrl, 'utf8')
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  if (current?.replace(/\r\n/g, '\n') === expected) return
  if (checkOnly) throw new Error('route-preview.ts 与 route-preview.json 不同步，请运行 npm run sync:data')
  await writeFile(adapterUrl, expected, 'utf8')
}
