import {
  LocationServiceError,
  locationService,
} from '../../services/location/location.service'
import { BEIBEI_VIEWPORT, getLocationViewport } from '../../services/map/map-viewport.service'
import {
  routePolylineService,
  type RouteMapPolyline,
} from '../../services/map/route-polyline.service'
import { routeNavigationService } from '../../services/navigation/route-navigation.service'

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
  key: string
  id: string
  name: string
  hasVerifiedCoordinate: boolean
  isLast: boolean
}

interface RouteDirectionView {
  id: string
  name: string
  summary: string
  selected: boolean
}

interface RouteOptionView {
  id: string
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
    latitude: BEIBEI_VIEWPORT.center.latitude as number,
    longitude: BEIBEI_VIEWPORT.center.longitude as number,
    scale: BEIBEI_VIEWPORT.scale as number,
    minScale: BEIBEI_VIEWPORT.minScale,
    maxScale: BEIBEI_VIEWPORT.maxScale,
    hasLocation: false,
    locationStatusKind: 'loading' as LocationStatusKind,
    locationStatusText: '正在获取你的位置…',
    canOpenSettings: false,
    busStopMarkers: [] as BusStopMarker[],
    routePolylines: [] as RouteMapPolyline[],
    routeName: '',
    routeDirectionName: '',
    routeDirections: [] as RouteDirectionView[],
    routeStops: [] as RouteStopView[],
    routeCoordinateStatusText: '',
    routeGeometryStatusText: '',
    routeServiceNote: '',
    routeDetailsExpanded: false,
    routeDataErrorText: '',
    selectedRouteId: 'route_1',
    routeOptions: [] as RouteOptionView[],
  },

  onLoad() {
    const routes = routeNavigationService.getRoutes()
    this.setData({
      routeOptions: routes.map((route) => ({
        id: route.routeId,
        name: route.routeName,
        selected: route.routeId === 'route_1',
      })),
    })
    this.loadRoute('route_1')
    void this.locateUser()
  },

  onReady() {
    wx.createMapContext('campus-map', this).setBoundary({
      southwest: BEIBEI_VIEWPORT.southwest,
      northeast: BEIBEI_VIEWPORT.northeast,
      fail: () => {
        console.warn('地图浏览范围设置失败，保留北碚默认视野和缩放限制')
      },
    })
  },

  loadRoute(routeId: string, directionId?: string) {
    try {
      const navigation = routeNavigationService.getRouteNavigation(
        routeId,
        directionId,
      )
      const directions = routeNavigationService.getDirections(routeId)
      const mappableStops = navigation.stops.filter(
        (stop) => stop.coordinate !== undefined,
      )

      this.setData({
        routeName: navigation.routeName,
        selectedRouteId: navigation.routeId,
        routeOptions: this.data.routeOptions.map((route) => ({
          ...route,
          selected: route.id === navigation.routeId,
        })),
        routeDirectionName: navigation.directionName,
        routeDirections: directions.map((direction) => ({
          id: direction.directionId,
          name: direction.directionName,
          summary: direction.summary,
          selected: direction.directionId === navigation.directionId,
        })),
        routeStops: navigation.stops.map((stop, index) => ({
          key: `${stop.stopId}-${index}`,
          id: stop.stopId,
          name: stop.stopName,
          hasVerifiedCoordinate: stop.coordinate !== undefined,
          isLast: index === navigation.stops.length - 1,
        })),
        busStopMarkers: mappableStops.map((stop, index) => ({
          id: 1000 + index,
          latitude: stop.coordinate!.latitude,
          longitude: stop.coordinate!.longitude,
          title: stop.stopName,
          iconPath: '/assets/icons/bus-stop-marker.svg',
          width: 30,
          height: 36,
          label: {
            content: `📍${stop.stopName}站`,
            color: '#126b47',
            fontSize: 12,
            borderRadius: 4,
            bgColor: '#ffffff',
            padding: 4,
          },
        })),
        routePolylines: navigation.geometry
          ? [
              routePolylineService.toMapPolyline(
                navigation.geometry,
              ),
            ]
          : [],
        routeCoordinateStatusText:
          navigation.stops.length - mappableStops.length > 0
            ? `${navigation.stops.length - mappableStops.length} 个站点坐标待现场校准，暂不显示 marker`
            : '全部站点坐标已校准',
        routeGeometryStatusText: navigation.geometry
          ? '当前方向线路轨迹已加载'
          : '当前方向线路轨迹待人工采集，暂以已知站序为参考',
        routeServiceNote: navigation.note ?? '',
        routeDataErrorText: '',
      })
    } catch (error: unknown) {
      this.setData({
        routeName:
          this.data.routeOptions.find((route) => route.id === routeId)?.name ??
          routeId,
        routeDirections: [],
        routeStops: [],
        busStopMarkers: [],
        routePolylines: [],
        routeCoordinateStatusText: '',
        routeGeometryStatusText: '',
        routeServiceNote: '',
        routeDataErrorText:
          error instanceof Error ? error.message : '线路数据加载失败',
      })
    }
  },

  async locateUser() {
    this.setData({
      locationStatusKind: 'loading',
      locationStatusText: '正在获取你的位置…',
      canOpenSettings: false,
    })

    try {
      const location = await locationService.getCurrentLocation()
      const viewport = getLocationViewport(location.coordinate)
      const { latitude, longitude } = viewport.center
      const accuracy = Math.round(location.accuracy)

      this.setData({
        latitude,
        longitude,
        scale: viewport.scale,
        hasLocation: true,
        locationStatusKind: location.isApproximate || !viewport.isWithinArea ? 'warning' : 'success',
        locationStatusText: !viewport.isWithinArea
          ? '当前位置不在北碚城区浏览范围内，地图保持显示西大周边'
          : location.isApproximate
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
    const directionId = event.currentTarget.dataset.directionId
    if (typeof directionId === 'string') {
      this.loadRoute(this.data.selectedRouteId, directionId)
    }
  },

  handleRouteChange(event: WechatMiniprogram.TouchEvent) {
    const routeId = event.currentTarget.dataset.routeId
    if (typeof routeId === 'string') {
      this.loadRoute(routeId)
    }
  },

  toggleRouteDetails() {
    this.setData({
      routeDetailsExpanded: !this.data.routeDetailsExpanded,
    })
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
