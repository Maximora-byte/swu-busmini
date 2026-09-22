import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const dataAdapters = [
  { file: 'stops', type: 'BusStop', name: 'stops' },
  { file: 'routes', type: 'BusRoute', name: 'routes' },
  { file: 'pois', type: 'CampusPOI', name: 'pois' },
  { file: 'coordinate-reviews', type: 'CoordinateReview', name: 'coordinateReviews' },
  { file: 'route-geometries', type: 'RouteGeometry', name: 'routeGeometries' },
] as const

export type DataAdapter = (typeof dataAdapters)[number]

export function serializeDataAdapter(adapter: DataAdapter, records: unknown): string {
  if (!Array.isArray(records)) {
    throw new Error(`${adapter.file}.json 根节点必须是数组`)
  }
  return [
    `import type { ${adapter.type} } from '../models/index'`,
    '',
    '/** 自动生成：修改同名 JSON 后运行 npm run sync:data，请勿手工编辑。 */',
    `export const ${adapter.name}: readonly ${adapter.type}[] = ${JSON.stringify(records, null, 2)}`,
    '',
  ].join('\n')
}

/** 先读取并解析全部 JSON，再写入；check 模式始终只读。 */
export async function syncDataAdapters(directory: string, check: boolean): Promise<string[]> {
  const outputs = await Promise.all(dataAdapters.map(async (adapter) => {
    const input: unknown = JSON.parse(await readFile(join(directory, `${adapter.file}.json`), 'utf8'))
    return {
      file: `${adapter.file}.ts`,
      content: serializeDataAdapter(adapter, input),
    }
  }))
  const stale: string[] = []
  for (const output of outputs) {
    const path = join(directory, output.file)
    let current: string | undefined
    try {
      current = await readFile(path, 'utf8')
    } catch (error: unknown) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    }
    if (current?.replace(/\r\n/g, '\n') === output.content) continue
    stale.push(output.file)
    if (!check) await writeFile(path, output.content, 'utf8')
  }
  return stale
}
