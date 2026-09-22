import {
  LocationServiceError,
  locationService,
} from '../../services/location/location.service'
import {
  BEIBEI_VIEWPORT,
  CAMPUS_VIEWPORT,
  getLocationViewport,
} from '../../services/map/map-viewport.service'
import type { RouteMapPolyline } from '../../services/map/route-polyline.service'
import {
  routeMapPresentationService,
  type BusStopMarker,
  type RouteDirectionView,
  type RouteOptionView,
  type RouteStopView,
} from '../../services/map/route-map-presentation.service'

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
  return { text: '定位时发生未知错误，请稍后重试。', canOpenSettings: false }
}

Page({
  cameraRequestVersion: 0,

  data: {
    latitude: CAMPUS_VIEWPORT.center.latitude as number,
    longitude: CAMPUS_VIEWPORT.center.longitude as number,
    scale: CAMPUS_VIEWPORT.scale as number,
    minScale: BEIBEI_VIEWPORT.minScale,
    maxScale: BEIBEI_VIEWPORT.maxScale,
    hasLocation: false,
    locationStatusKind: 'loading' as LocationStatusKind,
    locationStatusText: '正在获取你的位置…',
    canOpenSettings: false,
    busStopMarkers: [] as BusStopMarker[],
    routePolylines: [] as RouteMapPolyline[],
    routeName: '',
    routeColor: '#126b47',
    routeTextColor: '#ffffff',
    routeSummary: '',
    routeKindText: '',
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
    this.setData({ routeOptions: routeMapPresentationService.getRouteOptions('route_1') })
    this.loadRoute('route_1')
    void this.locateUser(false)
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
      const presentation = routeMapPresentationService.getRoutePresentation(routeId, directionId)
      this.setData({
        ...presentation,
        routeOptions: routeMapPresentationService.getRouteOptions(routeId),
      })
    } catch (error: unknown) {
      this.setData({
        routeName: this.data.routeOptions.find((route) => route.id === routeId)?.name ?? routeId,
        routeDirections: [],
        routeStops: [],
        busStopMarkers: [],
        routePolylines: [],
        routeSummary: '',
        routeKindText: '',
        routeCoordinateStatusText: '',
        routeGeometryStatusText: '',
        routeServiceNote: '',
        routeDetailsExpanded: true,
        routeDataErrorText: error instanceof Error ? error.message : '线路数据加载失败',
      })
    }
  },

  async locateUser(moveCamera = true) {
    const cameraVersion = moveCamera ? ++this.cameraRequestVersion : this.cameraRequestVersion
    this.setData({
      locationStatusKind: 'loading',
      locationStatusText: '正在获取你的位置…',
      canOpenSettings: false,
    })
    try {
      const location = await locationService.getCurrentLocation()
      const viewport = getLocationViewport(location.coordinate)
      const accuracy = Math.round(location.accuracy)
      this.setData({
        hasLocation: true,
        locationStatusKind: location.isApproximate || !viewport.isWithinArea ? 'warning' : 'success',
        locationStatusText: !viewport.isWithinArea
          ? '当前位置在浏览范围外，地图可切回校园全览'
          : location.isApproximate
            ? `已定位，精度约 ${accuracy} 米；请结合现场确认`
            : `定位成功，精度约 ${accuracy} 米`,
        canOpenSettings: false,
      })
      // 首次定位只更新位置与状态；用户主动点“我的位置”时才移动镜头。
      if (moveCamera && cameraVersion === this.cameraRequestVersion) {
        this.moveMap(viewport.center.latitude, viewport.center.longitude, viewport.scale)
      }
    } catch (error: unknown) {
      const errorView = locationErrorView(error)
      this.setData({
        locationStatusKind: 'error',
        locationStatusText: errorView.text,
        canOpenSettings: errorView.canOpenSettings,
      })
    }
  },

  moveMap(latitude: number, longitude: number, scale: number) {
    this.cameraRequestVersion += 1
    this.setData({ latitude, longitude, scale })
    // 拖动后 data 中中心值可能没变，显式移动确保“回到校园”始终有效。
    wx.createMapContext('campus-map', this).moveToLocation({ latitude, longitude })
  },

  handleCampusOverview() {
    this.setData({ routeDetailsExpanded: false })
    this.moveMap(CAMPUS_VIEWPORT.center.latitude, CAMPUS_VIEWPORT.center.longitude, CAMPUS_VIEWPORT.scale)
  },

  handleBeibeiOverview() {
    this.moveMap(BEIBEI_VIEWPORT.center.latitude, BEIBEI_VIEWPORT.center.longitude, BEIBEI_VIEWPORT.scale)
  },

  handleRetry() {
    void this.locateUser()
  },

  handleDirectionChange(event: WechatMiniprogram.TouchEvent) {
    const directionId = event.currentTarget.dataset.directionId
    if (typeof directionId === 'string') this.loadRoute(this.data.selectedRouteId, directionId)
  },

  handleRouteChange(event: WechatMiniprogram.TouchEvent) {
    const routeId = event.currentTarget.dataset.routeId
    if (typeof routeId === 'string') this.loadRoute(routeId)
  },

  toggleRouteDetails() {
    this.setData({ routeDetailsExpanded: !this.data.routeDetailsExpanded })
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
