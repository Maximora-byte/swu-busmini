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
import { navigationPlannerService, type NavigationPlace, type NavigationPlan, type TransferNavigationPlan } from '../../services/navigation/navigation-planner.service'
import { routeNetworkService, type RouteNetworkLegend } from '../../services/map/route-network.service'
import type { Coordinate } from '../../models/index'
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
    activeTab: 'map',
    navigationPlaces: [] as NavigationPlace[],
    originNames: [] as string[],
    destinationNames: [] as string[],
    originIndex: 0,
    destinationIndex: 0,
    navigationPlans: [] as NavigationPlan[],
    transferPlans: [] as TransferNavigationPlan[],
    showAllRoutes: false,
    includePreview: false,
    networkLegend: [] as RouteNetworkLegend[],
    networkNotice: '',
    networkFitPoints: [] as Coordinate[],
    networkSelectedTitle: '',
    networkCoverageText: '',
    networkMissingSegments: [] as string[],
    navigationMessage: '选择目的地，查询途经线路；指定起点后可查询直达方向。',
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
    const places = navigationPlannerService.getPlaces()
    this.setData({
      navigationPlaces: places,
      originNames: ['未指定起点（查看途经线路）', ...places.map(({ name }) => name)],
      destinationNames: places.map(({ name }) => name),
      destinationIndex: Math.max(0, places.findIndex(({ id }) => id === 'poi:library')),
    })
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

  handleTabChange(event: WechatMiniprogram.TouchEvent) {
    const tab = event.currentTarget.dataset.tab
    if (tab === 'map' || tab === 'navigation') {
      this.cameraRequestVersion += 1
      this.setData({ activeTab: tab })
    }
  },

  handleOriginChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.originNames.length) return
    this.setData({ originIndex: index, navigationPlans: [], transferPlans: [], navigationMessage: '起点已更新，请重新查询。' })
  },

  handleDestinationChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.navigationPlaces.length) return
    this.setData({ destinationIndex: index, navigationPlans: [], transferPlans: [], navigationMessage: '目的地已更新，请重新查询。' })
  },

  handlePlanNavigation() {
    try {
      const destination = this.data.navigationPlaces[this.data.destinationIndex]
      if (!destination) throw new Error('请选择目的地')
      const origin = this.data.originIndex > 0 ? this.data.navigationPlaces[this.data.originIndex - 1] : undefined
      const result = navigationPlannerService.plan(origin?.id, destination.id)
      this.setData({ navigationPlans: result.plans, transferPlans: result.transferPlans, navigationMessage: result.message })
    } catch (error: unknown) {
      this.setData({ navigationPlans: [], transferPlans: [], navigationMessage: error instanceof Error ? error.message : '查询失败，请重试' })
    }
  },

  handleOpenNavigationRoute(event: WechatMiniprogram.TouchEvent) {
    const plan = this.data.navigationPlans.find(({ id }) => id === event.currentTarget.dataset.planId)
    if (!plan) return
    this.selectRoute(plan.routeId, plan.directionId)
  },

  handleOpenTransferLeg(event: WechatMiniprogram.TouchEvent) {
    const plan = this.data.transferPlans.find(({ id }) => id === event.currentTarget.dataset.planId)
    const leg = plan?.legs[Number(event.currentTarget.dataset.legIndex)]
    if (!leg) return
    this.selectRoute(leg.routeId, leg.directionId)
  },

  selectRoute(routeId: string, directionId?: string) {
    // 选线是用户明确请求查看这条参考路线，不需要再手动关闭总览。
    const cameraVersion = ++this.cameraRequestVersion
    this.setData({ showAllRoutes: false, includePreview: true })
    const loaded = this.loadRoute(routeId, directionId)
    this.setData({ activeTab: 'map', routeDetailsExpanded: !loaded }, () => {
      // 等地图从导航页重新显示、布局完成后再移动镜头；忽略过期选择。
      if (loaded && cameraVersion === this.cameraRequestVersion) this.fitCurrentNetwork()
    })
  },

  refreshNetwork() {
    if (this.data.routeDataErrorText) return
    const overlay = routeNetworkService.getOverlay({
      selectedRouteId: this.data.selectedRouteId,
      directionId: this.data.routeDirections.find((direction) => direction.selected)?.id,
      showAllRoutes: this.data.showAllRoutes,
      includePreview: this.data.includePreview,
    })
    this.setData({ routePolylines: overlay.polylines, networkLegend: overlay.legend,
      networkNotice: overlay.notice, networkFitPoints: overlay.fitPoints,
      networkSelectedTitle: overlay.selectedTitle, networkCoverageText: overlay.coverageText,
      networkMissingSegments: overlay.missingSegments })
  },

  handlePreviewChange(event: WechatMiniprogram.SwitchChange) {
    this.cameraRequestVersion += 1
    this.setData({ includePreview: event.detail.value })
    this.refreshNetwork()
  },

  handleNetworkChange(event: WechatMiniprogram.SwitchChange) {
    this.cameraRequestVersion += 1
    this.setData({ showAllRoutes: event.detail.value })
    this.refreshNetwork()
  },

  handleFitNetwork() {
    if (this.data.networkFitPoints.length < 2) return
    this.cameraRequestVersion += 1
    const cameraVersion = this.cameraRequestVersion
    this.setData({ routeDetailsExpanded: false }, () => {
      if (cameraVersion === this.cameraRequestVersion) this.fitCurrentNetwork()
    })
  },

  fitCurrentNetwork() {
    if (this.data.activeTab !== 'map' || this.data.networkFitPoints.length < 2) return
    wx.createMapContext('campus-map', this).includePoints({
      points: this.data.networkFitPoints, padding: [36, 36, 36, 36],
    })
  },

  loadRoute(routeId: string, directionId?: string) {
    try {
      const presentation = routeMapPresentationService.getRoutePresentation(routeId, directionId)
      this.setData({
        ...presentation,
        routeOptions: routeMapPresentationService.getRouteOptions(routeId),
      })
      this.refreshNetwork()
      return true
    } catch (error: unknown) {
      this.setData({
        selectedRouteId: routeId,
        routeOptions: this.data.routeOptions.map((route) => ({ ...route, selected: false })),
        routeName: this.data.routeOptions.find((route) => route.id === routeId)?.name ?? routeId,
        routeDirections: [],
        routeStops: [],
        busStopMarkers: [],
        routePolylines: [],
        networkLegend: [],
        networkFitPoints: [],
        networkNotice: '线路数据加载失败，暂不显示路网。',
        networkSelectedTitle: '',
        networkCoverageText: '',
        networkMissingSegments: [],
        routeSummary: '',
        routeKindText: '',
        routeCoordinateStatusText: '',
        routeGeometryStatusText: '',
        routeServiceNote: '',
        routeDetailsExpanded: true,
        routeDataErrorText: error instanceof Error ? error.message : '线路数据加载失败',
      })
      return false
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
    if (typeof directionId === 'string') this.selectRoute(this.data.selectedRouteId, directionId)
  },

  handleRouteChange(event: WechatMiniprogram.TouchEvent) {
    const routeId = event.currentTarget.dataset.routeId
    if (typeof routeId === 'string') this.selectRoute(routeId)
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
