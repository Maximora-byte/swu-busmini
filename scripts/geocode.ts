import { createGeocodingService } from '../miniprogram/services/map/geocoding.service'
import {
  TencentMapProvider,
  type TencentRequestClient,
} from '../miniprogram/services/map/tencent/tencent-map.provider'

interface LocalConfig {
  tencentMapKey: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function loadLocalConfig(): Promise<LocalConfig> {
  const moduleUrl = new URL(
    '../miniprogram/config/config.local.ts',
    import.meta.url,
  )
  let loadedModule: unknown
  try {
    loadedModule = await import(moduleUrl.href)
  } catch {
    throw new Error(
      '缺少 miniprogram/config/config.local.ts，请先从 config.example.ts 复制并填写腾讯地图 Key。',
    )
  }

  if (!isRecord(loadedModule) || !isRecord(loadedModule.config)) {
    throw new Error('config.local.ts 必须导出 config 对象')
  }
  const key = loadedModule.config.tencentMapKey
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('config.local.ts 中的 tencentMapKey 不能为空')
  }
  return { tencentMapKey: key.trim() }
}

function createNodeRequestClient(): TencentRequestClient {
  return {
    async get(endpoint, parameters) {
      const url = new URL(endpoint)
      for (const [name, value] of Object.entries(parameters)) {
        url.searchParams.set(name, String(value))
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`腾讯位置服务 HTTP 请求失败: ${response.status}`)
      }
      return response.json()
    },
  }
}

async function main(): Promise<void> {
  const keyword = process.argv.slice(2).join(' ').trim()
  if (keyword.length === 0) {
    throw new Error('用法: npm run geocode "地址关键词"')
  }

  const config = await loadLocalConfig()
  const provider = new TencentMapProvider({
    key: config.tencentMapKey,
    requestClient: createNodeRequestClient(),
    region: '重庆市',
  })
  const candidates = await createGeocodingService(provider).getCandidates(
    keyword,
  )

  console.log(JSON.stringify({ keyword, candidates }, null, 2))
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '未知错误'
  console.error(`地理编码失败: ${message}`)
  process.exitCode = 1
})
