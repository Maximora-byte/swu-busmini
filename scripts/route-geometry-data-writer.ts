import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { RouteGeometry } from '../miniprogram/models/index'
import { dataAdapters, serializeDataAdapter } from './data-adapter'

const jsonPath = fileURLToPath(
  new URL('../miniprogram/data/route-geometries.json', import.meta.url),
)
const adapterPath = fileURLToPath(
  new URL('../miniprogram/data/route-geometries.ts', import.meta.url),
)

/** 同步维护 Node 工具 JSON 和微信运行时 TypeScript Adapter。 */
export async function writeRouteGeometryData(
  geometries: readonly RouteGeometry[],
): Promise<void> {
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(geometries, null, 2)}\n`, 'utf8'),
    writeFile(adapterPath, serializeDataAdapter(dataAdapters[4], geometries), 'utf8'),
  ])
}
