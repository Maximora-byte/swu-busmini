import {
  LocationServiceError,
  locationService,
} from '../../services/location/location.service'
import type { Coordinate } from '../../models/index'
import { routeCatalogService } from '../../services/route/route-catalog.service'

const SWU_BEIBEI_CAMPUS: Coordinate = {
  latitude: 29.821737,
  longitude: 106.422968,
}

type LocationStatusKind = 'loading' | 'success' | 'warning' | 'error'

interface BusStopMarker {
  id: number
  latitude: number
  longitude: number
  title: string
  iconPath: string
  width: number
  height: number
  label: {
    content: string
    color: string
    fontSize: number
    borderRadius: number
    bgColor: string
    padding: number
  }
}

interface RouteStopView {
  id: string
  name: string
  hasCoordinate: boolean
  isLast: boolean
}

interface RouteDirectionView {
  name: string
  selected: boolean
}

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
    busStopMarkers: [] as BusStopMarker[],
    routeName: '',
    routeDirectionName: '',
    routeDirections: [] as RouteDirectionView[],
    routeStops: [] as RouteStopView[],
    routeCoordinateStatusText: '',
  },

  onLoad() {
    this.loadRoute()
    void this.locateUser()
  },

  loadRoute(directionName?: string) {
    const details = routeCatalogService.getRouteDetails(
      'route_1',
      directionName,
    )

    this.setData({
      routeName: details.route.name,
      routeDirectionName: details.direction.name,
      routeDirections: details.route.directions.map((direction) => ({
        name: direction.name,
        selected: direction.name === details.direction.name,
      })),
      routeStops: details.stops.map((stop, index) => ({
        id: stop.id,
        name: stop.name,
        hasCoordinate: stop.coordinate !== null,
        isLast: index === details.stops.length - 1,
      })),
      busStopMarkers: details.mappableStops.map((stop, index) => ({
        id: 1000 + index,
        latitude: stop.coordinate.latitude,
        longitude: stop.coordinate.longitude,
        title: stop.name,
        iconPath: '/assets/icons/bus-stop-marker.svg',
        width: 30,
        height: 36,
        label: {
          content: stop.name,
          color: '#126b47',
          fontSize: 12,
          borderRadius: 4,
          bgColor: '#ffffff',
          padding: 4,
        },
      })),
      routeCoordinateStatusText:
        details.pendingCoordinateCount > 0
          ? `${details.pendingCoordinateCount} 个站点坐标待现场校准，暂不显示 marker`
          : '全部站点坐标已校准',
    })
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

  handleDirectionChange(event: WechatMiniprogram.TouchEvent) {
    const directionName = event.currentTarget.dataset.directionName
    if (typeof directionName === 'string') {
      this.loadRoute(directionName)
    }
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
