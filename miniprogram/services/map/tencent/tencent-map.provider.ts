import type {
  CandidateCoordinate,
  Coordinate,
  WalkingRouteResult,
} from '../../../models/index'
import type { MapProvider } from '../map-provider'

const TENCENT_MAP_BASE_URL = 'https://apis.map.qq.com'

type TencentRequestParameters = Readonly<Record<string, string | number>>

export interface TencentRequestClient {
  get(url: string, parameters: TencentRequestParameters): Promise<unknown>
}

export interface TencentMapProviderOptions {
  key: string
  requestClient?: TencentRequestClient
  baseUrl?: string
}

export class TencentMapProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TencentMapProviderError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TencentMapProviderError(`腾讯位置服务${description}无效`)
  }
  return value
}

function readFiniteNumber(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TencentMapProviderError(`腾讯位置服务${description}无效`)
  }
  return value
}

function readString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TencentMapProviderError(`腾讯位置服务${description}无效`)
  }
  return value
}

function readSuccessfulResult(response: unknown): Record<string, unknown> {
  const root = readRecord(response, '响应')
  const status = readFiniteNumber(root.status, '状态码')
  if (status !== 0) {
    const message =
      typeof root.message === 'string' && root.message.trim().length > 0
        ? root.message
        : '请求失败'
    throw new TencentMapProviderError(
      `腾讯位置服务请求失败 (${status}): ${message}`,
    )
  }
  return readRecord(root.result, '结果')
}

function readCoordinate(value: unknown): Coordinate {
  const location = readRecord(value, '坐标')
  const latitude = readFiniteNumber(location.lat, '纬度')
  const longitude = readFiniteNumber(location.lng, '经度')
  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new TencentMapProviderError('腾讯位置服务坐标超出有效范围')
  }
  return { latitude, longitude }
}

function formatCoordinate(coordinate: Coordinate): string {
  const { latitude, longitude } = coordinate
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError('Coordinate latitude or longitude is invalid')
  }
  return `${latitude},${longitude}`
}

function decodePolyline(value: unknown): Coordinate[] {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length % 2 !== 0 ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    throw new TencentMapProviderError('腾讯位置服务步行路线折线无效')
  }

  const decoded = [...value] as number[]
  for (let index = 2; index < decoded.length; index += 1) {
    decoded[index] = decoded[index - 2]! + decoded[index]! / 1_000_000
  }

  const coordinates: Coordinate[] = []
  for (let index = 0; index < decoded.length; index += 2) {
    coordinates.push(
      readCoordinate({ lat: decoded[index], lng: decoded[index + 1] }),
    )
  }
  return coordinates
}

export function createWechatTencentRequestClient(): TencentRequestClient {
  return {
    get: (url, parameters) =>
      new Promise<unknown>((resolve, reject) => {
        wx.request({
          url,
          method: 'GET',
          data: parameters,
          success: ({ data }) => resolve(data),
          fail: reject,
        })
      }),
  }
}

export class TencentMapProvider implements MapProvider {
  private readonly key: string
  private readonly requestClient: TencentRequestClient
  private readonly baseUrl: string

  constructor(options: TencentMapProviderOptions) {
    const key = options.key.trim()
    if (key.length === 0) {
      throw new Error('腾讯位置服务 Key 不能为空')
    }
    this.key = key
    this.requestClient =
      options.requestClient ?? createWechatTencentRequestClient()
    this.baseUrl = (options.baseUrl ?? TENCENT_MAP_BASE_URL).replace(/\/$/, '')
  }

  async geocode(keyword: string): Promise<CandidateCoordinate> {
    const address = keyword.trim()
    if (address.length === 0) {
      throw new Error('地理编码关键词不能为空')
    }

    const response = await this.requestClient.get(
      `${this.baseUrl}/ws/geocoder/v1/`,
      { key: this.key, address },
    )
    const result = readSuccessfulResult(response)
    const similarity = readFiniteNumber(result.similarity, '相似度')

    return {
      coordinate: readCoordinate(result.location),
      source: 'tencent',
      confidence: Math.min(1, Math.max(0, similarity)),
      verified: false,
    }
  }

  async reverseGeocode(coordinate: Coordinate): Promise<string> {
    const response = await this.requestClient.get(
      `${this.baseUrl}/ws/geocoder/v1/`,
      {
        key: this.key,
        location: formatCoordinate(coordinate),
        get_poi: 0,
      },
    )
    const result = readSuccessfulResult(response)
    return readString(result.address, '地址')
  }

  async walkingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<WalkingRouteResult> {
    const response = await this.requestClient.get(
      `${this.baseUrl}/ws/direction/v1/walking/`,
      {
        key: this.key,
        from: formatCoordinate(origin),
        to: formatCoordinate(destination),
      },
    )
    const result = readSuccessfulResult(response)
    if (!Array.isArray(result.routes) || result.routes.length === 0) {
      throw new TencentMapProviderError('腾讯位置服务未返回步行路线')
    }
    const route = readRecord(result.routes[0], '步行路线')
    const distanceMeters = readFiniteNumber(route.distance, '步行距离')
    const durationMinutes = readFiniteNumber(route.duration, '步行时长')

    return {
      distanceMeters,
      durationSeconds: Math.round(durationMinutes * 60),
      polyline: decodePolyline(route.polyline),
    }
  }
}
