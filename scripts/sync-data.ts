import { fileURLToPath } from 'node:url'
import { syncDataAdapters } from './data-adapter'
import { syncRoutePreviewAdapter } from './route-preview-data'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--check')) {
    throw new Error('用法: npm run sync:data [-- --check]')
  }
  const check = args.includes('--check')
  const directory = fileURLToPath(new URL('../miniprogram/data/', import.meta.url))
  const stale = await syncDataAdapters(directory, check)
  await syncRoutePreviewAdapter(check)
  if (check && stale.length > 0) {
    throw new Error(`数据 Adapter 未同步: ${stale.join(', ')}；请运行 npm run sync:data`)
  }
  console.log(check ? '✓ Data Adapter 已同步' : `✓ 已同步 ${stale.length} 个 Data Adapter；请继续运行 validate:data 和 typecheck`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '数据同步失败')
  process.exitCode = 1
})
