import type { Coordinate } from '../../models/index'
import type { TransitDataset, TransitStop } from '../../models/current-transit'
import { currentTransitRepository } from '../../services/repository/current-transit.repository'
import { transitJourneyService, type TransitJourney, type TransitJourneyLeg } from '../../services/navigation/transit-journey.service'
import { isAutomaticBoardingVisit } from '../../services/navigation/transit-visit-policy'
import { locationService } from '../../services/location/location.service'
import { BEIBEI_VIEWPORT, CAMPUS_VIEWPORT } from '../../services/map/map-viewport.service'

interface JourneyLegView extends TransitJourneyLeg {
  boardingName: string
  alightingName: string
  directionText: string
  pathText: string
}
interface JourneyView extends TransitJourney {
  title: string
  distanceText: string
  legs: JourneyLegView[]
}
interface JourneyMarker extends Coordinate {
  id: number
  stopId: string
  title: string
  iconPath: string
  width: number
  height: number
  callout: { content: string; color: string; bgColor: string; padding: number; borderRadius: number; display: 'ALWAYS' | 'BYCLICK' }
}

function marker(dataset: TransitDataset, stop: TransitStop, prefix = ''): JourneyMarker {
  return {
    id: 1000 + dataset.stops.findIndex(({ id }) => id === stop.id), stopId: stop.id,
    ...stop.coordinate, title: stop.name, iconPath: '/assets/icons/bus-stop-marker.png', width: 24, height: 32,
    callout: { content: prefix + stop.name, color: '#174231', bgColor: '#ffffff', padding: 6, borderRadius: 4, display: prefix ? 'ALWAYS' : 'BYCLICK' },
  }
}

Page({
  dataset: null as TransitDataset | null,
  pageVisible: true,
  mapReady: false,
  cameraRequestVersion: 0,
  endpointRequestVersion: 0,
  data: {
    sourceText: '', directionStatusText: '实际运营方向尚未独立确认，请现场核对。',
    routeOptions: [] as { id: string; name: string }[], selectedRouteId: '', routeName: '',
    stopOptions: [] as { id: string; label: string }[], stopNames: [] as string[],
    originIndex: 0, destinationIndex: 0, originMode: 'stop', originCoordinate: null as Coordinate | null,
    locating: false, locationMessage: '', journeyMessage: '选择上、下车参考点，查询直达或一次换乘方案。',
    journeys: [] as JourneyView[], selectedJourneyId: '',
    latitude: CAMPUS_VIEWPORT.center.latitude as number, longitude: CAMPUS_VIEWPORT.center.longitude as number,
    scale: CAMPUS_VIEWPORT.scale as number, minScale: BEIBEI_VIEWPORT.minScale, maxScale: BEIBEI_VIEWPORT.maxScale,
    mapMarkers: [] as JourneyMarker[], mapPolylines: [] as { points: Coordinate[]; color: string; width: number; arrowLine?: boolean }[],
    mapFitPoints: [] as Coordinate[], mapTitle: '', routeWarnings: [] as string[], stopMessage: '',
  },

  onLoad(query: { routeId?: string } = {}) {
    this.dataset = currentTransitRepository.getDataset()
    const dataset = this.dataset
    const eligibleStopIds = new Set(dataset.routes.flatMap((route) => route.visits.filter(isAutomaticBoardingVisit).map(({ stopId }) => stopId)))
    const planningStops = dataset.stops.filter(({ id }) => eligibleStopIds.has(id))
    const nameCounts = new Map<string, number>()
    planningStops.forEach(({ name }) => nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1))
    const stopOptions = planningStops.map((stop) => {
      const lines = dataset.routes.filter((route) => route.visits.some((visit) => visit.stopId === stop.id && isAutomaticBoardingVisit(visit))).map(({ name }) => name)
      return { id: stop.id, label: nameCounts.get(stop.name)! > 1 ? `${stop.name} · ${lines.join('/')}` : stop.name }
    })
    this.setData({
      sourceText: `${dataset.source} · ${dataset.observedAt}`,
      routeOptions: dataset.routes.map(({ id, name }) => ({ id, name })),
      stopOptions, stopNames: stopOptions.map(({ label }) => label), destinationIndex: stopOptions.length > 1 ? 1 : 0,
    })
    this.showRoute(dataset.routes.some(({ id }) => id === query.routeId) ? query.routeId! : dataset.routes[0].id)
  },

  onReady() {
    this.mapReady = true
    wx.createMapContext('journey-map', this).setBoundary({ southwest: BEIBEI_VIEWPORT.southwest, northeast: BEIBEI_VIEWPORT.northeast })
    this.fitMap()
  },
  onShow() { this.pageVisible = true },
  onHide() { this.cancelPendingActions() },
  onUnload() { this.cancelPendingActions(false); this.mapReady = false },
  cancelPendingActions(updateView = true) {
    this.pageVisible = false
    this.cameraRequestVersion += 1
    this.endpointRequestVersion += 1
    if (updateView) this.setData({
      locating: false,
      ...(this.data.locating ? { locationMessage: '定位已取消，可重新定位或选择上车站。' } : {}),
    })
  },

  fitMap() {
    if (!this.pageVisible || !this.mapReady || this.data.mapFitPoints.length < 2) return
    const version = this.cameraRequestVersion
    const points = this.data.mapFitPoints
    wx.createSelectorQuery().in(this).select('#journey-map').boundingClientRect((rect) => {
      if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0 ||
        version !== this.cameraRequestVersion || !this.pageVisible || !this.mapReady) return
      // Native callouts extend above their anchors. Bound the inset by the measured
      // map size so short screens still have room for the riding segment.
      const side = Math.min(80, rect.width * 0.2)
      wx.createMapContext('journey-map', this).includePoints({
        points, padding: [Math.min(120, rect.height * 0.4), side, Math.min(80, rect.height * 0.2), side],
      })
    }).exec()
  },
  showRoute(routeId: string, fit = true) {
    const dataset = this.dataset
    const route = dataset?.routes.find(({ id }) => id === routeId)
    if (!dataset || !route) return
    const version = ++this.cameraRequestVersion
    const ids = new Set(route.visits.map(({ stopId }) => stopId))
    const eligibleIds = new Set(route.visits.filter(isAutomaticBoardingVisit).map(({ stopId }) => stopId))
    this.setData({
      selectedRouteId: route.id, routeName: route.name, selectedJourneyId: '', stopMessage: '',
      mapTitle: `${route.name} · 运营方发布轨迹`, routeWarnings: [...route.warnings],
      mapPolylines: [{ points: route.points, color: route.color, width: 7 }],
      mapMarkers: dataset.stops.filter(({ id }) => ids.has(id)).map((stop) => {
        if (eligibleIds.has(stop.id)) return marker(dataset, stop)
        const reviewMarker = marker(dataset, stop, '待核对 · ')
        return { ...reviewMarker, title: `${stop.name}（待核对，暂不自动推荐）`,
          callout: { ...reviewMarker.callout, color: '#956324' } }
      }),
      mapFitPoints: route.points,
    }, () => { if (fit && version === this.cameraRequestVersion) this.fitMap() })
  },
  handleRouteChange(event: WechatMiniprogram.TouchEvent) {
    const routeId = event.currentTarget.dataset.routeId
    if (typeof routeId === 'string') this.showRoute(routeId)
  },

  clearJourneys() {
    this.endpointRequestVersion += 1
    this.setData({
      journeys: [], selectedJourneyId: '', locating: false, journeyMessage: '选择已更新，请重新查询。',
      ...(this.data.locating ? { locationMessage: '定位已取消，可重新定位或选择上车站。' } : {}),
    })
    this.showRoute(this.data.selectedRouteId, false)
  },
  handleOriginChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    if (!Number.isInteger(index) || !this.data.stopOptions[index]) return
    this.clearJourneys()
    this.setData({ originIndex: index, originMode: 'stop', originCoordinate: null, locationMessage: '' })
  },
  handleDestinationChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    if (!Number.isInteger(index) || !this.data.stopOptions[index]) return
    this.clearJourneys()
    this.setData({ destinationIndex: index })
  },
  async handleUseLocation() {
    this.clearJourneys()
    const version = this.endpointRequestVersion
    this.setData({ locating: true, originMode: 'stop', originCoordinate: null, locationMessage: '正在定位…' })
    try {
      const location = await locationService.getCurrentLocation()
      if (version !== this.endpointRequestVersion || !this.pageVisible) return
      this.setData({
        originMode: 'coordinate', originCoordinate: location.coordinate,
        locationMessage: `已使用本次定位结果${location.isApproximate ? '，定位精度较低，请核对候车位置' : ''}；接驳距离按直线估算。`,
      })
    } catch (error: unknown) {
      if (version === this.endpointRequestVersion && this.pageVisible) {
        this.setData({ locationMessage: error instanceof Error ? error.message : '定位失败，可继续选择上车站。' })
      }
    } finally {
      if (version === this.endpointRequestVersion && this.pageVisible) this.setData({ locating: false })
    }
  },

  handlePlanJourney() {
    if (this.data.locating) { this.setData({ journeyMessage: '请等待定位完成，或手动选择上车站。' }); return }
    try {
      const origin = this.data.originMode === 'coordinate' && this.data.originCoordinate
        ? { kind: 'coordinate' as const, coordinate: this.data.originCoordinate }
        : { kind: 'stop' as const, stopId: this.data.stopOptions[this.data.originIndex]?.id }
      const destination = { kind: 'stop' as const, stopId: this.data.stopOptions[this.data.destinationIndex]?.id }
      const result = transitJourneyService.plan(origin, destination)
      const dataset = this.dataset!
      const name = (id: string) => dataset.stops.find((stop) => stop.id === id)?.name ?? '未知站点'
      const journeys: JourneyView[] = result.journeys.map((journey) => ({
        ...journey, title: journey.legs.length === 1 ? '直达' : '换乘一次',
        distanceText: `乘车约 ${Math.round(journey.rideDistanceMeters)} 米 · 接驳直线约 ${Math.round(journey.accessDistanceMeters + journey.egressDistanceMeters)} 米`,
        legs: journey.legs.map((leg) => ({
          ...leg, boardingName: name(leg.boardingStopId), alightingName: name(leg.alightingStopId),
          directionText: `先经${name(leg.stopIds[1] ?? leg.alightingStopId)}`,
          pathText: leg.stopIds.map(name).join(' → '),
        })),
      }))
      this.cameraRequestVersion += 1
      this.setData({ journeys, selectedJourneyId: '', journeyMessage: result.message })
      if (journeys[0]) this.showJourney(journeys[0])
      else this.showRoute(this.data.selectedRouteId, false)
    } catch (error: unknown) {
      this.setData({ journeys: [], selectedJourneyId: '', journeyMessage: error instanceof Error ? error.message : '暂不能生成乘车方案。' })
      this.showRoute(this.data.selectedRouteId, false)
    }
  },
  handleShowJourney(event: WechatMiniprogram.TouchEvent) {
    const journey = this.data.journeys.find(({ id }) => id === event.currentTarget.dataset.journeyId)
    if (journey) this.showJourney(journey)
  },
  showJourney(journey: JourneyView) {
    const dataset = this.dataset!
    const markers = new Map<string, JourneyMarker>()
    journey.legs.forEach((leg, index) => {
      const boarding = dataset.stops.find(({ id }) => id === leg.boardingStopId)!
      const alighting = dataset.stops.find(({ id }) => id === leg.alightingStopId)!
      markers.set(boarding.id, marker(dataset, boarding, index === 0 ? '上车 · ' : '换乘 · '))
      markers.set(alighting.id, marker(dataset, alighting, index === journey.legs.length - 1 ? '下车 · ' : '换乘 · '))
    })
    const version = ++this.cameraRequestVersion
    const points = journey.legs.flatMap((leg) => leg.points)
    this.setData({
      selectedJourneyId: journey.id, mapTitle: '所选乘车区间', stopMessage: '', routeWarnings: [...journey.warnings],
      mapPolylines: journey.legs.map((leg) => ({ points: leg.points, color: leg.color, width: 8, arrowLine: true })),
      mapMarkers: [...markers.values()], mapFitPoints: [
        ...points, ...[...markers.values()].map(({ latitude, longitude }) => ({ latitude, longitude })),
      ],
    }, () => { if (version === this.cameraRequestVersion) this.fitMap() })
  },
  handleOpenStop(event: WechatMiniprogram.TouchEvent) {
    const { journeyId, legIndex, pointKind } = event.currentTarget.dataset
    const journey = this.data.journeys.find(({ id }) => id === journeyId)
    const index = Number(legIndex)
    if (!journey || !Number.isInteger(index) || index < 0 || !journey.legs[index] || !['boarding', 'alighting'].includes(pointKind)) return
    const leg = journey.legs[index]
    const stop = this.dataset?.stops.find(({ id }) => id === (pointKind === 'boarding' ? leg.boardingStopId : leg.alightingStopId))
    if (stop) wx.openLocation({ ...stop.coordinate, name: stop.name, address: '享坐车发布候车参考点，请结合现场确认', scale: 18 })
  },
  handleMarkerTap(event: WechatMiniprogram.MarkerTap) {
    const stop = this.data.mapMarkers.find(({ id }) => id === Number(event.detail.markerId))
    if (stop) this.setData({ stopMessage: `${stop.title} · 运营方发布候车参考点` })
  },
  handleOpenHistory() { wx.navigateTo({ url: '/pages/index/index' }) },
})
