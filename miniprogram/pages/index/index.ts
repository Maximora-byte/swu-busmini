import {
  LocationServiceError,
  locationService,
} from '../../services/location/location.service'
import type { Coordinate } from '../../models/index'
import {
  routePolylineService,
  type RouteMapPolyline,
} from '../../services/map/route-polyline.service'
import { routeNavigationService } from '../../services/navigation/route-navigation.service'
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
  key: string
  id: string
  name: string
  hasVerifiedCoordinate: boolean
  isLast: boolean
}

interface RouteDirectionView {
  name: string
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
    latitude: SWU_BEIBEI_CAMPUS.latitude,
    longitude: SWU_BEIBEI_CAMPUS.longitude,
    scale: 15,
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
    const routes = routeCatalogService.getRoutes()
    this.setData({
      routeOptions: routes.map((route) => ({
        id: route.id,
        name: route.name,
        selected: route.id === 'route_1',
      })),
    })
    this.loadRoute('route_1')
    void this.locateUser()
  },

  loadRoute(routeId: string, directionName?: string) {
    try {
      const details = routeCatalogService.getRouteDetails(
        routeId,
        directionName,
      )
      const navigation = routeNavigationService.getRouteNavigation(routeId)
      const navigationDirection = navigation.directions.find(
        ({ directionId }) => directionId === details.direction.name,
      )
      const verifiedStopIds = new Set(
        details.mappableStops.map((stop) => stop.id),
      )

      this.setData({
        routeName: details.route.name,
        selectedRouteId: details.route.id,
        routeOptions: this.data.routeOptions.map((route) => ({
          ...route,
          selected: route.id === details.route.id,
        })),
        routeDirectionName: details.direction.name,
        routeDirections: details.route.directions.map((direction) => ({
          name: direction.name,
          selected: direction.name === details.direction.name,
        })),
        routeStops: details.stops.map((stop, index) => ({
          key: `${stop.id}-${index}`,
          id: stop.id,
          name: stop.name,
          hasVerifiedCoordinate: verifiedStopIds.has(stop.id),
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
            content: `📍${stop.name}站`,
            color: '#126b47',
            fontSize: 12,
            borderRadius: 4,
            bgColor: '#ffffff',
            padding: 4,
          },
        })),
        routePolylines: navigationDirection?.geometry
          ? [
              routePolylineService.toMapPolyline(
                navigationDirection.geometry,
              ),
            ]
          : [],
        routeCoordinateStatusText:
          details.pendingCoordinateCount > 0
            ? `${details.pendingCoordinateCount} 个站点坐标待现场校准，暂不显示 marker`
            : '全部站点坐标已校准',
        routeGeometryStatusText: navigationDirection?.geometry
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
      this.loadRoute(this.data.selectedRouteId, directionName)
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
