import type {
  CandidateCoordinate,
  Coordinate,
  DrivingRouteResult,
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
  region?: string
}

/** External search evidence only; never a verified campus stop. */
export interface TencentPlaceCandidate {
  id: string
  title: string
  address: string
  coordinate: Coordinate
}

export type TencentMapProviderErrorCode =
  | 'INVALID_KEY'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'

export class TencentMapProviderError extends Error {
  constructor(
    public readonly code: TencentMapProviderErrorCode,
    message: string,
    public readonly status?: number,
  ) {
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
    throw new TencentMapProviderError(
      'INVALID_RESPONSE',
      `腾讯位置服务${description}无效`,
    )
  }
  return value
}

function readFiniteNumber(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TencentMapProviderError(
      'INVALID_RESPONSE',
      `腾讯位置服务${description}无效`,
    )
  }
  return value
}

function readString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TencentMapProviderError(
      'INVALID_RESPONSE',
      `腾讯位置服务${description}无效`,
    )
  }
  return value
}

interface TencentResponse {
  root: Record<string, unknown>
  status: number
}

function readResponse(response: unknown): TencentResponse {
  const root = readRecord(response, '响应')
  const status = readFiniteNumber(root.status, '状态码')
  return { root, status }
}

function throwRequestError(
  root: Record<string, unknown>,
  status: number,
): never {
  const message =
    typeof root.message === 'string' && root.message.trim().length > 0
      ? root.message
      : '请求失败'
  const code: TencentMapProviderErrorCode = [190, 199, 311].includes(status)
    ? 'INVALID_KEY'
    : 'API_ERROR'
  throw new TencentMapProviderError(
    code,
    `腾讯位置服务请求失败 (${status}): ${message}`,
    status,
  )
}

function readSuccessfulResult(response: unknown): Record<string, unknown> {
  const { root, status } = readResponse(response)
  if (status !== 0) {
    throwRequestError(root, status)
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
    throw new TencentMapProviderError(
      'INVALID_RESPONSE',
      '腾讯位置服务坐标超出有效范围',
    )
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
    throw new TencentMapProviderError(
      'INVALID_RESPONSE',
      '腾讯位置服务路线折线无效',
    )
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

function readRouteResult(
  result: Record<string, unknown>,
  routeType: string,
): DrivingRouteResult {
  if (!Array.isArray(result.routes) || result.routes.length === 0) {
    throw new TencentMapProviderError(
      'INVALID_RESPONSE',
      `腾讯位置服务未返回${routeType}路线`,
    )
  }
  const route = readRecord(result.routes[0], `${routeType}路线`)
  const distanceMeters = readFiniteNumber(route.distance, `${routeType}距离`)
  const durationMinutes = readFiniteNumber(route.duration, `${routeType}时长`)

  return {
    distanceMeters,
    durationSeconds: Math.round(durationMinutes * 60),
    polyline: decodePolyline(route.polyline),
  }
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
  private readonly region?: string

  constructor(options: TencentMapProviderOptions) {
    const key = options.key.trim()
    if (key.length === 0) {
      throw new TencentMapProviderError(
        'INVALID_KEY',
        '腾讯位置服务 Key 不能为空',
      )
    }
    this.key = key
    this.requestClient =
      options.requestClient ?? createWechatTencentRequestClient()
    this.baseUrl = (options.baseUrl ?? TENCENT_MAP_BASE_URL).replace(/\/$/, '')
    const region = options.region?.trim()
    this.region = region && region.length > 0 ? region : undefined
  }

  private async request(
    path: string,
    parameters: TencentRequestParameters,
  ): Promise<unknown> {
    try {
      return await this.requestClient.get(
        `${this.baseUrl}${path}`,
        parameters,
      )
    } catch (error: unknown) {
      if (error instanceof TencentMapProviderError) {
        throw error
      }
      throw new TencentMapProviderError(
        'NETWORK_ERROR',
        '腾讯位置服务网络请求失败，请检查网络后重试',
      )
    }
  }

  async geocode(keyword: string): Promise<readonly CandidateCoordinate[]> {
    const address = keyword.trim()
    if (address.length === 0) {
      throw new Error('地理编码关键词不能为空')
    }

    const parameters: Record<string, string | number> = {
      key: this.key,
      address,
    }
    if (this.region) {
      parameters.region = this.region
    }
    const response = await this.request('/ws/geocoder/v1/', parameters)
    const { root, status } = readResponse(response)
    if (status === 347) {
      return []
    }
    if (status !== 0) {
      throwRequestError(root, status)
    }
    if (root.result === undefined || root.result === null) {
      return []
    }

    const result = readRecord(root.result, '结果')
    if (result.location === undefined || result.location === null) {
      return []
    }
    const similarity = readFiniteNumber(result.similarity, '相似度')

    return [
      {
        coordinate: readCoordinate(result.location),
        source: 'tencent',
        confidence: Math.min(1, Math.max(0, similarity)),
        verified: false,
      },
    ]
  }

  async reverseGeocode(coordinate: Coordinate): Promise<string> {
    const response = await this.request(
      '/ws/geocoder/v1/',
      {
        key: this.key,
        location: formatCoordinate(coordinate),
        get_poi: 0,
      },
    )
    const result = readSuccessfulResult(response)
    return readString(result.address, '地址')
  }

  /** Development acquisition uses exact-name evidence, not geocoder similarity. */
  async searchPlaces(keyword: string): Promise<readonly TencentPlaceCandidate[]> {
    const query = keyword.trim()
    if (!query) throw new Error('地点搜索关键词不能为空')
    const { root, status } = readResponse(await this.request('/ws/place/v1/search', {
      key: this.key,
      keyword: query,
      boundary: 'region(北碚区,2)',
      page_size: 20,
      page_index: 1,
    }))
    if (status !== 0) throwRequestError(root, status)
    if (!Array.isArray(root.data)) {
      throw new TencentMapProviderError('INVALID_RESPONSE', '腾讯位置服务地点列表无效')
    }
    return root.data.map((value: unknown) => {
      const place = readRecord(value, '地点')
      return {
        id: readString(place.id, '地点 ID'),
        title: readString(place.title, '地点名称'),
        address: typeof place.address === 'string' ? place.address : '',
        coordinate: readCoordinate(place.location),
      }
    })
  }

  async walkingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<WalkingRouteResult> {
    const response = await this.request(
      '/ws/direction/v1/walking/',
      {
        key: this.key,
        from: formatCoordinate(origin),
        to: formatCoordinate(destination),
      },
    )
    const result = readSuccessfulResult(response)
    return readRouteResult(result, '步行')
  }

  async drivingRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<DrivingRouteResult> {
    const response = await this.request(
      '/ws/direction/v1/driving/',
      {
        key: this.key,
        from: formatCoordinate(origin),
        to: formatCoordinate(destination),
      },
    )
    return readRouteResult(readSuccessfulResult(response), '驾车')
  }
}
