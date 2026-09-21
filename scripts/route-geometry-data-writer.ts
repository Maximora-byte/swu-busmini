import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { RouteGeometry } from '../miniprogram/models/index'

const jsonPath = fileURLToPath(
  new URL('../miniprogram/data/route-geometries.json', import.meta.url),
)
const adapterPath = fileURLToPath(
  new URL('../miniprogram/data/route-geometries.ts', import.meta.url),
)

function serializeAdapter(geometries: readonly RouteGeometry[]): string {
  return [
    "import type { RouteGeometry } from '../models/index'",
    '',
    '/** 微信运行时使用的线路轨迹数据 Adapter。 */',
    `export const routeGeometries: readonly RouteGeometry[] = ${JSON.stringify(geometries, null, 2)}`,
    '',
  ].join('\n')
}

/** 同步维护 Node 工具 JSON 和微信运行时 TypeScript Adapter。 */
export async function writeRouteGeometryData(
  geometries: readonly RouteGeometry[],
): Promise<void> {
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(geometries, null, 2)}\n`, 'utf8'),
    writeFile(adapterPath, serializeAdapter(geometries), 'utf8'),
  ])
}
