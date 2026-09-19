import {
  LocationServiceError,
  locationService,
} from '../../services/location/location.service'
import type { Coordinate } from '../../models/index'

const SWU_BEIBEI_CAMPUS: Coordinate = {
  latitude: 29.821737,
  longitude: 106.422968,
}

type LocationStatusKind = 'loading' | 'success' | 'warning' | 'error'

function locationErrorView(error: unknown): {
  text: string
  canOpenSettings: boolean
} {
  if (error instanceof LocationServiceError) {
    return {
      text: error.message,
      canOpenSettings: error.code === 'PERMISSION_DENIED',
    }
  }

  return {
    text: '定位时发生未知错误，请稍后重试。',
    canOpenSettings: false,
  }
}

Page({
  data: {
    latitude: SWU_BEIBEI_CAMPUS.latitude,
    longitude: SWU_BEIBEI_CAMPUS.longitude,
    scale: 15,
    hasLocation: false,
    locationStatusKind: 'loading' as LocationStatusKind,
    locationStatusText: '正在获取你的位置…',
    canOpenSettings: false,
  },

  onLoad() {
    void this.locateUser()
  },

  async locateUser() {
    this.setData({
      locationStatusKind: 'loading',
      locationStatusText: '正在获取你的位置…',
      canOpenSettings: false,
    })

    try {
      const location = await locationService.getCurrentLocation()
      const { latitude, longitude } = location.coordinate
      const accuracy = Math.round(location.accuracy)

      this.setData({
        latitude,
        longitude,
        scale: 17,
        hasLocation: true,
        locationStatusKind: location.isApproximate ? 'warning' : 'success',
        locationStatusText: location.isApproximate
          ? `已定位，但当前位置精度约为 ${accuracy} 米`
          : `定位成功，精度约为 ${accuracy} 米`,
        canOpenSettings: false,
      })
    } catch (error: unknown) {
      const errorView = locationErrorView(error)
      this.setData({
        locationStatusKind: 'error',
        locationStatusText: errorView.text,
        canOpenSettings: errorView.canOpenSettings,
      })
    }
  },

  handleRetry() {
    void this.locateUser()
  },

  handleOpenSetting(event: WechatMiniprogram.ButtonOpenSetting) {
    if (event.detail.authSetting['scope.userLocation']) {
      void this.locateUser()
      return
    }

    this.setData({
      locationStatusKind: 'error',
      locationStatusText: '位置权限仍未开启，无法显示当前位置。',
      canOpenSettings: true,
    })
  },
})
