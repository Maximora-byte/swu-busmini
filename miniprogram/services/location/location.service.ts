import type { Coordinate, Location } from '../../models/index'

const DEFAULT_MAX_ACCEPTABLE_ACCURACY_METERS = 100
const HIGH_ACCURACY_TIMEOUT_MS = 5000

export type LocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'LOCATION_UNAVAILABLE'
  | 'INVALID_RESULT'

export class LocationServiceError extends Error {
  constructor(
    public readonly code: LocationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'LocationServiceError'
  }
}

export interface RawLocation {
  latitude: number
  longitude: number
  accuracy: number
}

/**
 * 微信 API 的最小适配边界。测试可以注入假实现，不依赖 wx 全局对象。
 * undefined 表示用户尚未选择过位置权限。
 */
export interface LocationPlatformApi {
  getLocationPermission(): Promise<boolean | undefined>
  getLocation(): Promise<RawLocation>
}

export interface LocationServiceOptions {
  maxAcceptableAccuracyMeters?: number
  now?: () => number
}

export interface LocationService {
  getCurrentLocation(): Promise<Location>
}

function isValidCoordinate(coordinate: Coordinate): boolean {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  )
}

function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'errMsg' in error &&
    typeof error.errMsg === 'string'
  ) {
    return error.errMsg
  }

  return error instanceof Error ? error.message : ''
}

export function classifyLocationError(error: unknown): LocationServiceError {
  const message = errorMessage(error).toLowerCase()

  if (
    message.includes('system permission') ||
    message.includes('locationswitchoff') ||
    message.includes('location service')
  ) {
    return new LocationServiceError(
      'LOCATION_UNAVAILABLE',
      '系统定位服务不可用，请在设备设置中开启定位后重试。',
    )
  }

  if (
    message.includes('auth deny') ||
    message.includes('auth denied') ||
    message.includes('authorize') ||
    message.includes('permission denied') ||
    message.includes('privacy permission')
  ) {
    return new LocationServiceError(
      'PERMISSION_DENIED',
      '位置权限未开启，请在小程序设置中允许访问位置信息。',
    )
  }

  if (message.includes('timeout')) {
    return new LocationServiceError(
      'TIMEOUT',
      '定位请求超时，请到开阔区域后重试。',
    )
  }

  return new LocationServiceError(
    'LOCATION_UNAVAILABLE',
    '暂时无法获取位置，请确认系统定位服务已开启并稍后重试。',
  )
}

export function createLocationService(
  platformApi: LocationPlatformApi,
  options: LocationServiceOptions = {},
): LocationService {
  const maxAcceptableAccuracyMeters =
    options.maxAcceptableAccuracyMeters ??
    DEFAULT_MAX_ACCEPTABLE_ACCURACY_METERS
  const now = options.now ?? Date.now

  return {
    async getCurrentLocation(): Promise<Location> {
      let permission: boolean | undefined

      try {
        permission = await platformApi.getLocationPermission()
      } catch {
        // 查询设置失败不应阻止定位；实际调用仍会返回准确的权限错误。
        permission = undefined
      }

      if (permission === false) {
        throw new LocationServiceError(
          'PERMISSION_DENIED',
          '位置权限未开启，请在小程序设置中允许访问位置信息。',
        )
      }

      let rawLocation: RawLocation
      try {
        rawLocation = await platformApi.getLocation()
      } catch (error: unknown) {
        throw classifyLocationError(error)
      }

      const coordinate: Coordinate = {
        latitude: rawLocation.latitude,
        longitude: rawLocation.longitude,
      }

      if (
        !isValidCoordinate(coordinate) ||
        !Number.isFinite(rawLocation.accuracy) ||
        rawLocation.accuracy < 0
      ) {
        throw new LocationServiceError(
          'INVALID_RESULT',
          '定位结果无效，请稍后重试。',
        )
      }

      return {
        coordinate,
        accuracy: rawLocation.accuracy,
        isApproximate: rawLocation.accuracy > maxAcceptableAccuracyMeters,
        timestamp: now(),
      }
    },
  }
}

function createWechatLocationApi(): LocationPlatformApi {
  return {
    getLocationPermission: () =>
      new Promise<boolean | undefined>((resolve, reject) => {
        wx.getSetting({
          success: (result) => {
            resolve(result.authSetting['scope.userLocation'])
          },
          fail: reject,
        })
      }),
    getLocation: () =>
      new Promise<RawLocation>((resolve, reject) => {
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: true,
          highAccuracyExpireTime: HIGH_ACCURACY_TIMEOUT_MS,
          success: (result) => {
            resolve({
              latitude: result.latitude,
              longitude: result.longitude,
              accuracy: result.accuracy,
            })
          },
          fail: reject,
        })
      }),
  }
}

/** 页面使用的默认实例；平台对象在调用时创建，便于 Node 环境导入并测试模块。 */
export const locationService: LocationService = {
  getCurrentLocation: () =>
    createLocationService(createWechatLocationApi()).getCurrentLocation(),
}
