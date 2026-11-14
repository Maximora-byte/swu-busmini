import type { Coordinate } from '../../models/index'
import type { TransitDataset, TransitStop, TransitVisitDirection } from '../../models/current-transit'
import { currentTransitRepository } from '../../services/repository/current-transit.repository'
import { transitJourneyService, type TransitJourney, type TransitJourneyLeg } from '../../services/navigation/transit-journey.service'
import { isAutomaticBoardingVisit } from '../../services/navigation/transit-visit-policy'
import { createCampusPlaceSearchService, type CampusSearchSuggestion } from '../../services/navigation/campus-place-search.service'
import { campusMapPlaces } from '../../data/campus-map-places'
import { locationService } from '../../services/location/location.service'
import { BEIBEI_VIEWPORT, CAMPUS_VIEWPORT, getLocationViewport } from '../../services/map/map-viewport.service'
import { getCurrentMapPresentation, type CurrentRouteStopView } from '../../services/map/current-transit-map.service'
import { createSheetLayout, getSheetGeometry, getOverlayMapPadding, type SheetSnap } from '../../services/map/map-sheet-layout'
import { getUnifiedTransitStops, type UnifiedTransitStop } from '../../services/map/unified-transit-stops'

const INITIAL_SHEET = createSheetLayout()

interface JourneyLegView extends TransitJourneyLeg {
  boardingName: string
  alightingName: string
  directionText: string
  pathText: string
}
interface JourneyView extends TransitJourney {
  title: string
  distanceText: string
  connectionText: string
  isRecommended: boolean
  legs: JourneyLegView[]
}
type EndpointField = 'origin' | 'destination'
interface ReferenceCircle extends Coordinate { color: string; fillColor: string; radius: number; strokeWidth: number }
function nearbyStopViews(stops: CampusSearchSuggestion['nearbyStops']) {
  return stops.map((stop) => ({ ...stop, distanceMeters: Math.round(stop.distanceMeters) }))
}
function endpointField(value: unknown): EndpointField | undefined {
  return value === 'origin' || value === 'destination' ? value : undefined
}
interface JourneyMarker extends Coordinate {
  id: number
  stopId: string
  stationId?: string
  stopIds?: string[]
  title: string
  iconPath: string
  width: number
  height: number
  callout: { content: string; color: string; bgColor: string; padding: number; borderRadius: number; fontSize: number; display: 'ALWAYS' | 'BYCLICK' }
}

function marker(dataset: TransitDataset, stop: TransitStop, prefix = ''): JourneyMarker {
  return {
    id: 1000 + dataset.stops.findIndex(({ id }) => id === stop.id), stopId: stop.id,
    ...stop.coordinate, title: stop.name, iconPath: '/assets/icons/bus-stop-marker.png', width: 24, height: 32,
    callout: { content: prefix + stop.name, color: '#174231', bgColor: '#ffffff', padding: 6, borderRadius: 8, fontSize: 13, display: prefix ? 'ALWAYS' : 'BYCLICK' },
  }
}

Page({
  dataset: null as TransitDataset | null,
  stations: [] as UnifiedTransitStop[],
  pageVisible: true,
  mapReady: false,
  cameraRequestVersion: 0,
  endpointRequestVersion: 0,
  mapLocationRequestVersion: 0,
  rememberedJourneyId: '',
  confirmedOriginStopId: '',
  placeSearch: null as ReturnType<typeof createCampusPlaceSearchService> | null,
  nativePlaceRequestVersion: 0,
  pendingTencentPlace: null as { field: EndpointField; point: Coordinate; name: string; details: string; version: number } | null,
  sheetLayout: INITIAL_SHEET,
  sheetTapSuppressedUntil: 0,
  data: {
    originAllowedVisits: null as TransitVisitDirection[] | null,
    destinationAllowedVisits: null as TransitVisitDirection[] | null,
    selectedStation: null as UnifiedTransitStop | null,
    sheetSnap: 'peek' as SheetSnap, sheetGeometry: getSheetGeometry(INITIAL_SHEET, 'peek', 0),
    focusedSearchField: '', keyboardHeight: 0, sheetScrollTarget: '', planMessageVisible: false,
    journeyPreview: null as { title: string; boardingName: string; alightingName: string; routeText: string; distanceText: string; connectionText: string } | null,
    viewMode: 'map', showAllRoutes: true, referenceReverse: false,
    routeStops: [] as CurrentRouteStopView[], routeSummary: '', routeColor: '#126b47', selectedVisitKey: '',
    routeDetailsExpanded: false, dataNotesExpanded: false,
    mapLegend: [] as { routeId: string; name: string; color: string }[],
    mapLocation: null as Coordinate | null, mapLocating: false, mapLocationMessage: '',
    sourceText: '', directionStatusText: '实际运营方向尚未独立确认，请现场核对。',
    routeOptions: [] as { id: string; name: string; color: string }[], selectedRouteId: '', routeName: '',
    stopOptions: [] as { id: string; label: string }[], stopNames: [] as string[], stopPickerNames: [] as string[],
    originIndex: 0, destinationIndex: 0, originMode: 'location', originCoordinate: null as Coordinate | null,
    destinationMode: 'search', destinationCoordinate: null as Coordinate | null,
    originQuery: '当前位置', destinationQuery: '', activeSearchField: '', searchVersion: 0,
    searchResults: [] as CampusSearchSuggestion[], searchMessage: '',
    nativePlacePicking: false, placeSelectionMessage: '', placeMessageField: '',
    originPlaceDetails: '', destinationPlaceDetails: '',
    originNearbyStops: [] as CampusSearchSuggestion['nearbyStops'], destinationNearbyStops: [] as CampusSearchSuggestion['nearbyStops'],
    mapSelectionField: '', mapSelectionMessage: '', mapCircles: [] as ReferenceCircle[],
    locating: false, locationMessage: '', journeyMessage: '选择上、下车参考点，查询直达或一次换乘方案。',
    journeys: [] as JourneyView[], selectedJourneyId: '',
    latitude: CAMPUS_VIEWPORT.center.latitude as number, longitude: CAMPUS_VIEWPORT.center.longitude as number,
    scale: CAMPUS_VIEWPORT.scale as number, minScale: BEIBEI_VIEWPORT.minScale, maxScale: BEIBEI_VIEWPORT.maxScale,
    mapMarkers: [] as JourneyMarker[], mapPolylines: [] as { points: Coordinate[]; color: string; width: number; arrowLine?: boolean }[],
    mapFitPoints: [] as Coordinate[], mapTitle: '', routeWarnings: [] as string[], stopMessage: '',
  },

  onLoad(query: { routeId?: string; view?: string } = {}) {
    this.sheetLayout = createSheetLayout(wx.getWindowInfo?.() ?? {})
    const sheetSnap = query.view === 'journey' ? 'half' : 'peek'
    this.dataset = currentTransitRepository.getDataset()
    const dataset = this.dataset
    this.stations = getUnifiedTransitStops(dataset)
    this.placeSearch = createCampusPlaceSearchService(dataset, campusMapPlaces)
    const initialRouteId = dataset.routes.some(({ id }) => id === query.routeId) ? query.routeId! : ''
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
      routeOptions: dataset.routes.map(({ id, name, color }) => ({ id, name, color })),
      viewMode: query.view === 'journey' ? 'journey' : 'map',
      stopOptions, stopNames: stopOptions.map(({ label }) => label), destinationIndex: stopOptions.length > 1 ? 1 : 0,
      stopPickerNames: ['请选择候车参考站', ...stopOptions.map(({ label }) => label)],
      originMode: 'location', originQuery: '当前位置', destinationQuery: '', showAllRoutes: !initialRouteId,
      originAllowedVisits: null, destinationAllowedVisits: null,
      sheetSnap, sheetGeometry: getSheetGeometry(this.sheetLayout, sheetSnap, 1),
    })
    this.showRoute(initialRouteId)
  },

  onReady() {
    this.mapReady = true
    wx.createMapContext('journey-map', this).setBoundary({ southwest: BEIBEI_VIEWPORT.southwest, northeast: BEIBEI_VIEWPORT.northeast })
    this.fitMap()
  },
  onShow() { this.pageVisible = true; this.applyPendingTencentPlace() },
  onResize(event: { size: { windowWidth: number; windowHeight: number } }) {
    if ((this.data.focusedSearchField || this.data.keyboardHeight) && event.size.windowWidth === this.sheetLayout.width && event.size.windowHeight < this.sheetLayout.height) return
    this.sheetLayout = createSheetLayout({ ...(wx.getWindowInfo?.() ?? {}), ...event.size })
    this.setSheetSnap(this.data.sheetSnap)
  },
  onHide() { this.cancelPendingActions() },
  onUnload() { this.cancelPendingActions(false); this.mapReady = false },
  cancelPendingActions(updateView = true) {
    this.pageVisible = false
    // Reading the privacy contract can hide the page while a location API is
    // awaiting the user's decision. Keep that request alive until return.
    if (updateView && this.selectComponent?.('#privacy-consent')?.hasPendingPrivacy?.()) return
    this.cameraRequestVersion += 1
    this.mapLocationRequestVersion += 1
    // The native location picker can temporarily hide this page; commit its result only on return.
    if (updateView && this.data.nativePlacePicking) return
    this.endpointRequestVersion += 1
    this.pendingTencentPlace = null
    if (updateView) this.setData({
      locating: false, mapLocating: false,
      ...(this.data.mapLocating ? { mapLocationMessage: '定位已取消，可重新定位。' } : {}),
      activeSearchField: '', searchResults: [], searchVersion: this.data.searchVersion + 1,
      mapSelectionField: '', mapSelectionMessage: '',
      focusedSearchField: '', keyboardHeight: 0,
      sheetGeometry: getSheetGeometry(this.sheetLayout, this.data.sheetSnap, this.data.sheetGeometry.epoch + 1),
      ...(this.data.locating ? { locationMessage: '定位已取消，可重新定位或选择上车站。' } : {}),
    })
  },

  fitMap(focusPoints?: Coordinate[]) {
    const points = focusPoints ?? this.data.mapFitPoints
    if (!this.pageVisible || !this.mapReady || points.length < 2) return
    const version = this.cameraRequestVersion
    wx.createSelectorQuery().in(this).select('#journey-map').boundingClientRect((rect) => {
      if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0 ||
        version !== this.cameraRequestVersion || !this.pageVisible || !this.mapReady) return
      const calloutInset = Math.max(80, ...this.data.mapMarkers.filter(({ callout }) => callout.display === 'ALWAYS').map(({ callout }) => callout.content.length * 6.5 + 14))
      let padding = getOverlayMapPadding(rect.width, rect.height, this.sheetLayout, this.data.sheetGeometry, calloutInset)
      // A single station needs less surrounding context than a whole route. Keep
      // it below the search bar and above the sheet on compact displays too.
      if (!padding && focusPoints && this.data.sheetSnap !== 'full') {
        const sy = rect.height / this.sheetLayout.height
        const top = 84 * sy, bottom = (this.sheetLayout.height - this.data.sheetGeometry.y + 18) * sy
        const side = Math.min(40 * rect.width / this.sheetLayout.width, rect.width * .15)
        if (rect.height - top - bottom >= 64 * sy) padding = [top, side, bottom, side]
      }
      if (padding) wx.createMapContext('journey-map', this).includePoints({ points, padding })
    }).exec()
  },
  setSheetSnap(snap: SheetSnap, fit = true, afterRender?: () => void) {
    if (!['peek', 'half', 'full'].includes(snap)) return
    const version = ++this.cameraRequestVersion
    this.setData({ sheetSnap: snap, sheetGeometry: getSheetGeometry(this.sheetLayout, snap, this.data.sheetGeometry.epoch + 1, this.data.keyboardHeight),
      routeDetailsExpanded: this.data.viewMode === 'map' && snap !== 'peek' && !this.data.dataNotesExpanded,
      ...(snap !== 'full' ? { dataNotesExpanded: false } : {}),
    }, () => {
      if (version !== this.cameraRequestVersion || !this.pageVisible) return
      afterRender?.()
      if (fit) this.fitMap()
    })
  },
  handleSheetGestureEnd(value: { snap: string; epoch: number }) {
    if (!this.pageVisible || value.epoch !== this.data.sheetGeometry.epoch || !['peek', 'half', 'full'].includes(value.snap)) return
    this.sheetTapSuppressedUntil = Date.now() + 300
    wx.hideKeyboard()
    this.setData({ focusedSearchField: '', keyboardHeight: 0 })
    this.setSheetSnap(value.snap as SheetSnap)
  },
  handleToggleSheet() {
    if (Date.now() < this.sheetTapSuppressedUntil) return
    this.handleDismissKeyboard()
    this.setSheetSnap(this.data.sheetSnap === 'peek' ? 'half' : 'peek')
  },
  handleDismissKeyboard() {
    wx.hideKeyboard()
    this.setData({ focusedSearchField: '', keyboardHeight: 0 })
    this.setSheetSnap(this.data.sheetSnap, false)
  },
  handleOpenPlanner() {
    this.setData({ selectedStation: null })
    this.switchView('journey')
    const field = this.data.originMode === 'search' && this.data.destinationMode !== 'search' ? 'origin' : 'destination'
    this.setData({ dataNotesExpanded: false, focusedSearchField: '', sheetScrollTarget: '' })
    this.setSheetSnap('full', false, () => { this.setData({ focusedSearchField: field, sheetScrollTarget: `${field}-field` }) })
  },
  handleRestorePlan() { this.switchView('journey'); this.setSheetSnap('peek') },
  handleFitCurrentMap() { this.handleDismissKeyboard(); this.setSheetSnap('peek', false); this.fitMap() },
  handleSwapEndpoints() {
    this.handleDismissKeyboard()
    const d = this.data
    const originIndex = d.destinationIndex, destinationIndex = d.originIndex
    const originMode = d.destinationMode, destinationMode = d.originMode === 'coordinate' ? 'map' : d.originMode === 'location' ? 'search' : d.originMode
    const originCoordinate = d.destinationCoordinate ? { ...d.destinationCoordinate } : null
    const destinationCoordinate = d.originCoordinate ? { ...d.originCoordinate } : null
    const originQuery = originMode === 'map' ? '地图所选起点' : d.destinationQuery
    const destinationQuery = d.originMode === 'location' ? '' : d.originMode === 'coordinate' ? '原定位位置' : destinationMode === 'map' ? '地图所选终点' : d.originQuery
    this.clearJourneys()
    this.confirmedOriginStopId = ['stop', 'place'].includes(originMode) ? this.data.stopOptions[originIndex]?.id ?? '' : ''
    this.setData({ viewMode: 'journey', originIndex, destinationIndex, originMode, destinationMode, originCoordinate, destinationCoordinate,
      originAllowedVisits: d.destinationAllowedVisits, destinationAllowedVisits: d.originAllowedVisits,
      originQuery, destinationQuery, locationMessage: '',
      originPlaceDetails: d.destinationPlaceDetails, destinationPlaceDetails: d.originPlaceDetails,
      originNearbyStops: d.destinationNearbyStops, destinationNearbyStops: d.originNearbyStops })
    this.replanIfReady()
  },
  handleBrowseRoutes() {
    this.handleDismissKeyboard()
    this.switchView('map')
    this.setData({ dataNotesExpanded: false })
    this.setSheetSnap('peek')
  },
  handleShowJourneyDetails() {
    this.setData({ dataNotesExpanded: false, focusedSearchField: '', sheetScrollTarget: '' })
    this.setSheetSnap('full', false, () => { this.setData({ sheetScrollTarget: 'journey-results' }) })
  },
  handleClearEndpoint(event: WechatMiniprogram.TouchEvent) {
    const field = endpointField(event.currentTarget.dataset.field)
    if (!field) return
    this.handleSearchInput({ currentTarget: { dataset: { field } }, detail: { value: '' } })
    this.setData({ focusedSearchField: field, sheetScrollTarget: `${field}-field` })
    this.setSheetSnap('full')
  },
  handleKeyboardHeightChange(event: WechatMiniprogram.CustomEvent<{ height: number }>) {
    if (!this.pageVisible) return
    const height = event.detail.height
    if (!Number.isFinite(height) || height < 0 || (height > 0 && !this.data.focusedSearchField)) return
    const field = endpointField(event.currentTarget.dataset.field)
    if (field && this.data.focusedSearchField && field !== this.data.focusedSearchField) return
    if (height === this.data.keyboardHeight) return
    this.setData({ keyboardHeight: height, ...(height === 0 ? { focusedSearchField: '' } : {}) })
    this.setSheetSnap(height > 0 ? 'full' : this.data.sheetSnap, false)
  },
  handleToggleNetwork() {
    this.handleBrowseRoutes()
    this.handleNetworkChange({ detail: { value: !this.data.showAllRoutes } } as WechatMiniprogram.SwitchChange)
  },
  showRoute(routeId: string, fit = true) {
    const dataset = this.dataset
    if (!dataset || (!dataset.routes.some(({ id }) => id === routeId) && !(routeId === '' && this.data.showAllRoutes))) return
    const version = ++this.cameraRequestVersion
    const view = getCurrentMapPresentation(dataset, routeId, {
      network: this.data.showAllRoutes, reverse: this.data.referenceReverse,
    })
    const ids = new Set(view.stopIds)
    const eligibleIds = new Set(view.eligibleStopIds)
    this.setData({
      selectedStation: null,
      selectedRouteId: view.routeId, routeName: view.name, routeColor: view.color, selectedJourneyId: '', stopMessage: '', selectedVisitKey: '',
      routeStops: view.stops, routeSummary: view.summary, mapLegend: view.legend,
      mapTitle: this.data.showAllRoutes ? '自动匹配 · 十条现行线路总览' : `${view.name} · 运营方发布轨迹`,
      routeWarnings: view.warnings, mapPolylines: view.polylines,
      mapMarkers: this.stations.flatMap((station) => {
        const visible = station.stopIds.filter((id) => ids.has(id))
        if (!visible.length) return []
        const stop = dataset.stops.find((item) => visible.includes(item.id) &&
          item.coordinate.latitude === station.coordinate.latitude && item.coordinate.longitude === station.coordinate.longitude) ??
          dataset.stops.find((item) => item.id === visible[0])!
        const canBoard = visible.some((id) => eligibleIds.has(id))
        const item = marker(dataset, stop)
        return [{ ...item, stationId: station.id, stopIds: visible, title: station.label,
          callout: { ...item.callout, content: `${canBoard ? '' : '待核对 · '}${station.label} · ${station.routes.length}条线路`,
            color: canBoard ? '#174231' : '#956324' } }]
      }),
      mapFitPoints: view.fitPoints, mapCircles: [],
    }, () => { if (fit && version === this.cameraRequestVersion) this.fitMap() })
  },
  handleRouteChange(event: WechatMiniprogram.TouchEvent) {
    const routeId = event.currentTarget.dataset.routeId
    if (typeof routeId !== 'string' || !this.dataset?.routes.some(({ id }) => id === routeId)) return
    if (this.data.selectedJourneyId) this.rememberedJourneyId = this.data.selectedJourneyId
    this.setData({ viewMode: 'map', showAllRoutes: false, referenceReverse: false })
    this.setSheetSnap('peek', false)
    this.showRoute(routeId)
  },
  handleViewChange(event: WechatMiniprogram.TouchEvent) {
    const view = event.currentTarget.dataset.view
    if (view === 'map' || view === 'journey') this.switchView(view)
  },
  switchView(view: 'map' | 'journey') {
    if (view === this.data.viewMode) return
    if (this.data.selectedJourneyId) this.rememberedJourneyId = this.data.selectedJourneyId
    this.endpointRequestVersion += 1
    this.mapLocationRequestVersion += 1
    this.cameraRequestVersion += 1
    this.setData({ selectedStation: null, viewMode: view, locating: false, mapLocating: false,
      activeSearchField: '', searchResults: [], searchVersion: this.data.searchVersion + 1, mapSelectionField: '', mapSelectionMessage: '', focusedSearchField: '', keyboardHeight: 0,
      ...(this.data.locating ? { locationMessage: '定位已取消，可重新定位或选择上车站。' } : {}),
      ...(this.data.mapLocating ? { mapLocationMessage: '定位已取消，可重新定位。' } : {}),
    })
    const journey = this.data.journeys.find(({ id }) => id === this.rememberedJourneyId) ?? this.data.journeys[0]
    if (view === 'journey' && journey) this.showJourney(journey)
    else if (view === 'journey') this.showPlanningOverview(true)
    else this.showRoute(this.data.selectedRouteId)
  },
  handleNetworkChange(event: WechatMiniprogram.SwitchChange) {
    this.setData({ showAllRoutes: !!event.detail.value || !this.data.selectedRouteId, viewMode: 'map' })
    this.showRoute(this.data.selectedRouteId)
  },
  handleReferenceOrderChange(event: WechatMiniprogram.TouchEvent) {
    const order = event.currentTarget.dataset.order
    if (!['forward', 'reverse'].includes(order)) return
    this.setData({ referenceReverse: order === 'reverse' })
    this.showRoute(this.data.selectedRouteId, false)
  },
  toggleRouteDetails() {
    const open = !this.data.routeDetailsExpanded
    this.setData({ dataNotesExpanded: false })
    this.setSheetSnap(open ? 'half' : 'peek')
  },
  toggleDataNotes() {
    const open = !this.data.dataNotesExpanded
    this.handleDismissKeyboard()
    this.setData({ dataNotesExpanded: open, routeDetailsExpanded: false })
    this.setSheetSnap(open ? 'full' : 'peek')
  },
  moveViewport(coordinate: Coordinate, scale: number) {
    const version = ++this.cameraRequestVersion
    this.setData({ ...coordinate, scale }, () => {
      if (version === this.cameraRequestVersion && this.mapReady && this.pageVisible) {
        wx.createMapContext('journey-map', this).moveToLocation(coordinate)
      }
    })
  },
  handleCampusOverview() { this.setSheetSnap('peek', false); this.moveViewport(CAMPUS_VIEWPORT.center, CAMPUS_VIEWPORT.scale) },
  handleBeibeiOverview() { this.setSheetSnap('peek', false); this.moveViewport(BEIBEI_VIEWPORT.center, BEIBEI_VIEWPORT.scale) },
  async handleMapLocate() {
    this.setSheetSnap('peek', false)
    const version = ++this.mapLocationRequestVersion
    const cameraVersion = this.cameraRequestVersion
    this.setData({ mapLocating: true, mapLocation: null, mapLocationMessage: '正在定位…' })
    try {
      const location = await locationService.getCurrentLocation()
      if (version !== this.mapLocationRequestVersion || !this.pageVisible) return
      const viewport = getLocationViewport(location.coordinate)
      this.setData({ mapLocation: viewport.isWithinArea ? location.coordinate : null,
        mapLocationMessage: viewport.isWithinArea ?
          `已取得本次位置${location.isApproximate ? '，精度较低，请核对现场' : ''}。` : '当前位置不在北碚浏览范围，可继续手动选站或地图选点。' })
      if (viewport.isWithinArea && cameraVersion === this.cameraRequestVersion) this.moveViewport(viewport.center, viewport.scale)
    } catch (error: unknown) {
      if (version === this.mapLocationRequestVersion && this.pageVisible) this.setData({
        mapLocationMessage: error instanceof Error ? error.message : '定位失败，可继续浏览线路。',
      })
    } finally {
      if (version === this.mapLocationRequestVersion && this.pageVisible) this.setData({ mapLocating: false })
    }
  },
  handleRouteStopTap(event: WechatMiniprogram.TouchEvent) {
    const stop = this.data.routeStops.find(({ key }) => key === event.currentTarget.dataset.visitKey)
    if (!stop) return
    this.setData({ showAllRoutes: false })
    this.setSheetSnap('peek', false)
    this.showRoute(this.data.selectedRouteId, false)
    this.setData({ selectedVisitKey: stop.key, stopMessage: `${stop.name} · ${stop.canBoard ? '公布候车参考点' : stop.reviewText}`,
      mapMarkers: this.data.mapMarkers.map((item) => item.stopId === stop.stopId || item.stopIds?.includes(stop.stopId) ?
        { ...item, callout: { ...item.callout, display: 'ALWAYS' as const } } : item),
    })
    this.moveViewport(stop.coordinate, 17)
  },
  handleUseRouteStop(event: WechatMiniprogram.TouchEvent) {
    const field = endpointField(event.currentTarget.dataset.field)
    const stop = this.data.routeStops.find(({ key }) => key === event.currentTarget.dataset.visitKey)
    if (!field || !stop) return
    if (!stop.canBoard) { this.setData({ stopMessage: stop.reviewText }); return }
    const index = this.data.stopOptions.findIndex(({ id }) => id === stop.stopId)
    if (index < 0) return
    this.setData({ viewMode: 'journey' })
    const change = { detail: { value: String(index) } } as WechatMiniprogram.PickerChange
    if (field === 'origin') this.handleOriginChange(change)
    else this.handleDestinationChange(change)
    this.replanIfReady()
  },

  clearJourneys() {
    const redraw = !!this.data.selectedJourneyId || this.data.mapCircles.length > 0 || this.data.journeys.length > 0
    this.rememberedJourneyId = ''
    this.endpointRequestVersion += 1
    this.cameraRequestVersion += 1
    this.setData({
      journeys: [], selectedJourneyId: '', journeyPreview: null, planMessageVisible: false, locating: false, journeyMessage: '选择已更新，请重新查询。',
      activeSearchField: '', searchResults: [], searchVersion: this.data.searchVersion + 1,
      mapSelectionField: '', mapSelectionMessage: '', placeSelectionMessage: '', placeMessageField: '',
      ...(this.data.locating ? { locationMessage: '定位已取消，可重新定位或选择上车站。' } : {}),
    })
    if (redraw) this.showRoute(this.data.selectedRouteId, false)
  },
  handleOriginChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    if (!Number.isInteger(index) || !this.data.stopOptions[index]) return
    this.clearJourneys()
    this.confirmedOriginStopId = this.data.stopOptions[index].id
    this.setData({ originIndex: index, originMode: 'stop', originCoordinate: null, locationMessage: '',
      originAllowedVisits: null,
      originPlaceDetails: '', originNearbyStops: [],
      originQuery: this.dataset?.stops.find(({ id }) => id === this.data.stopOptions[index].id)?.name ?? '' })
  },
  handleDestinationChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    if (!Number.isInteger(index) || !this.data.stopOptions[index]) return
    this.clearJourneys()
    this.setData({ destinationIndex: index, destinationMode: 'stop', destinationCoordinate: null,
      destinationAllowedVisits: null,
      destinationPlaceDetails: '', destinationNearbyStops: [],
      destinationQuery: this.dataset?.stops.find(({ id }) => id === this.data.stopOptions[index].id)?.name ?? '' })
  },
  handleExactStopChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) - 1
    if (!Number.isInteger(index) || index < 0 || !this.data.stopOptions[index]) return
    const change = { detail: { value: String(index) } } as WechatMiniprogram.PickerChange
    if (event.currentTarget.dataset.field === 'origin') this.handleOriginChange(change)
    else if (event.currentTarget.dataset.field === 'destination') this.handleDestinationChange(change)
    else return
    this.replanIfReady()
  },
  handleSearchFocus(event: WechatMiniprogram.TouchEvent) {
    const field = endpointField(event.currentTarget.dataset.field)
    if (!field || !this.pageVisible) return
    if (field === 'origin' && this.data.originMode === 'location') {
      this.clearJourneys()
      this.setData({ originMode: 'search', originQuery: '', locationMessage: '', originPlaceDetails: '', originNearbyStops: [] })
    }
    this.setData({ viewMode: 'journey' })
    this.setData({ focusedSearchField: field, sheetScrollTarget: `${field}-field`, dataNotesExpanded: false })
    if (this.data.sheetSnap !== 'full') this.setSheetSnap('full', false)
    this.showSearchResults(field)
  },
  showSearchResults(field: EndpointField) {
    const query = field === 'origin' ? this.data.originQuery : this.data.destinationQuery
    const searchResults = (this.placeSearch?.search(query) ?? []).map((item) => ({ ...item, nearbyStops: nearbyStopViews(item.nearbyStops) }))
    this.setData({ activeSearchField: field, searchResults, searchVersion: this.data.searchVersion + 1,
      mapSelectionField: '', mapSelectionMessage: '',
      searchMessage: !query.trim() ? '输入校内地址、办事用途、楼号或站名。' :
        searchResults.length ? '点选地点后自动比较附近上下车点；距离为直线参考。' : '没有匹配的校内地点，可换关键词或用腾讯地图选点。',
    })
  },
  handleSearchInput(event: { currentTarget: { dataset: { field?: unknown } }; detail: { value: string } }) {
    const field = endpointField(event.currentTarget.dataset.field)
    if (!field || typeof event.detail.value !== 'string' || !this.pageVisible) return
    const query = event.detail.value.slice(0, 64)
    this.setData({ viewMode: 'journey' })
    this.clearJourneys()
    if (field === 'origin') this.confirmedOriginStopId = ''
    this.setData(field === 'origin' ? { originAllowedVisits: null, originQuery: query, originMode: 'search', originCoordinate: null, locationMessage: '', originPlaceDetails: '', originNearbyStops: [] } :
      { destinationAllowedVisits: null, destinationQuery: query, destinationMode: 'search', destinationCoordinate: null, destinationPlaceDetails: '', destinationNearbyStops: [] })
    this.setData({ focusedSearchField: field, sheetScrollTarget: `${field}-field`, dataNotesExpanded: false })
    if (this.data.sheetSnap !== 'full') this.setSheetSnap('full', false)
    this.showSearchResults(field)
  },
  handleSelectSearchResult(event: WechatMiniprogram.TouchEvent) {
    const { field: rawField, suggestionId, stopId, searchVersion } = event.currentTarget.dataset
    const field = endpointField(rawField)
    if (!field || !this.pageVisible || field !== this.data.activeSearchField || Number(searchVersion) !== this.data.searchVersion) return
    const suggestion = this.data.searchResults.find((item) => suggestionId ? item.id === suggestionId : typeof stopId === 'string' && item.stopId === stopId)
    if (!suggestion) return
    if (!suggestion.coordinate) {
      wx.hideKeyboard()
      this.setData({ focusedSearchField: '', keyboardHeight: 0 })
      this.clearJourneys()
      if (field === 'origin') this.confirmedOriginStopId = ''
      this.setData({ placeMessageField: field, placeSelectionMessage: `${suggestion.name}：名称和用途已收录，请用腾讯地图或地图选点确认具体位置后推荐站点。`,
        ...(field === 'origin' ? { originQuery: suggestion.name, originMode: 'search', originCoordinate: null, originIndex: -1,
          originPlaceDetails: suggestion.details ?? '', originNearbyStops: [], locationMessage: '' } : { destinationQuery: suggestion.name, destinationMode: 'search', destinationCoordinate: null,
          destinationIndex: -1, destinationPlaceDetails: suggestion.details ?? '', destinationNearbyStops: [] }) })
      this.setSheetSnap('full', false)
      return
    }
    this.commitCampusPlace(field, suggestion.coordinate, suggestion.name,
      `${suggestion.sourceLabel}。${suggestion.details ?? ''}`, suggestion.kind === 'stop' ? suggestion.stopId : undefined)
  },
  commitCampusPlace(field: EndpointField, point: Coordinate, name: string, details: string, stopId?: string, allowedVisits?: readonly TransitVisitDirection[]) {
    const index = stopId ? this.data.stopOptions.findIndex((item) => item.id === stopId) : -1
    const nearbyStops = nearbyStopViews(this.placeSearch?.nearby(point) ?? [])
    wx.hideKeyboard()
    this.setData({ focusedSearchField: '', keyboardHeight: 0 })
    if (field === 'origin') this.confirmedOriginStopId = stopId ?? ''
    this.clearJourneys()
    this.setData(field === 'origin' ? {
      originAllowedVisits: allowedVisits?.map((rule) => ({ ...rule })) ?? null,
      originQuery: name, originMode: 'place', originCoordinate: { ...point }, originIndex: index, locationMessage: '', originPlaceDetails: details, originNearbyStops: nearbyStops,
    } : { destinationAllowedVisits: allowedVisits?.map((rule) => ({ ...rule })) ?? null,
      destinationQuery: name, destinationMode: 'place', destinationCoordinate: { ...point }, destinationIndex: index, destinationPlaceDetails: details, destinationNearbyStops: nearbyStops })
    this.replanIfReady()
  },
  async handleChooseTencentPlace(event: WechatMiniprogram.TouchEvent) {
    const field = endpointField(event.currentTarget.dataset.field)
    if (!field || !this.pageVisible || this.data.nativePlacePicking) return
    this.handleDismissKeyboard()
    const version = ++this.endpointRequestVersion, request = ++this.nativePlaceRequestVersion
    this.mapLocationRequestVersion += 1
    this.pendingTencentPlace = null
    this.setData({ nativePlacePicking: true, locating: false, mapLocating: false, placeSelectionMessage: '', placeMessageField: field,
      ...(this.data.locating ? { locationMessage: '本次定位已取消，可重新定位或选择起点。' } : {}),
      ...(this.data.mapLocating ? { mapLocationMessage: '定位已取消，可重新定位。' } : {}) })
    try {
      const result = await new Promise<WechatMiniprogram.ChooseLocationSuccessCallbackResult>((resolve, reject) => {
        wx.chooseLocation({ ...CAMPUS_VIEWPORT.center, success: resolve, fail: reject })
      })
      if (version !== this.endpointRequestVersion) return
      const point = { latitude: result.latitude, longitude: result.longitude }
      if (!getLocationViewport(point).isWithinArea || typeof result.name !== 'string' || !result.name.trim()) {
        this.setData({ placeSelectionMessage: '未取得有效的校区周边位置，请在校园范围重新选点。' }); return
      }
      this.pendingTencentPlace = { field, point, name: result.name.trim().slice(0, 64),
        details: `腾讯地图选择位置。${typeof result.address === 'string' ? result.address.slice(0, 200) : ''}`, version }
      this.applyPendingTencentPlace()
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'errMsg' in error ? String(error.errMsg) : ''
      if (version === this.endpointRequestVersion && !/cancel(?:led)?\b/i.test(message)) this.setData({
        placeSelectionMessage: '腾讯地图选点暂不可用，可能尚未开放接口或获得位置权限；可继续搜索校内地点或手动点图。',
      })
    } finally {
      if (request === this.nativePlaceRequestVersion) this.setData({ nativePlacePicking: false })
    }
  },
  applyPendingTencentPlace() {
    const selected = this.pendingTencentPlace
    if (!selected || !this.pageVisible) return
    this.pendingTencentPlace = null
    if (selected.version === this.endpointRequestVersion) this.commitCampusPlace(selected.field, selected.point, selected.name, selected.details)
  },
  handleStartMapSelection(event: WechatMiniprogram.TouchEvent) {
    const field = endpointField(event.currentTarget.dataset.field)
    if (!field || !this.pageVisible || !this.mapReady) return
    wx.hideKeyboard()
    this.setData({ viewMode: 'journey' })
    this.clearJourneys()
    this.setData({ mapSelectionField: field, mapSelectionMessage: `请点击地图空白处选择${field === 'origin' ? '出发' : '到达'}位置，可先拖动／缩放。` })
    this.setData({ focusedSearchField: '', keyboardHeight: 0 })
    this.setSheetSnap('peek', false)
  },
  handleCancelMapSelection() { this.setData({ mapSelectionField: '', mapSelectionMessage: '' }); this.setSheetSnap('half') },
  handleMapTap(event: WechatMiniprogram.MapTap) {
    const field = endpointField(this.data.mapSelectionField)
    if (!field || !this.pageVisible) return
    const { latitude, longitude } = event.detail
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      this.setData({ mapSelectionMessage: '未取得有效地图位置，请重新点选。' }); return
    }
    const coordinate = { latitude, longitude }
    this.clearJourneys()
    if (field === 'origin') this.confirmedOriginStopId = ''
    const nearbyStops = nearbyStopViews(this.placeSearch?.nearby(coordinate) ?? [])
    this.setData(field === 'origin' ? { originAllowedVisits: null, originMode: 'map', originCoordinate: coordinate, originQuery: '地图所选起点', locationMessage: '', originPlaceDetails: '手动地图参考点。', originNearbyStops: nearbyStops } :
      { destinationAllowedVisits: null, destinationMode: 'map', destinationCoordinate: coordinate, destinationQuery: '地图所选终点', destinationPlaceDetails: '手动地图参考点。', destinationNearbyStops: nearbyStops })
    this.replanIfReady()
  },
  replanIfReady() {
    if (this.data.originMode !== 'search' && this.data.destinationMode !== 'search' && !this.data.locating) this.handlePlanJourney()
    else {
      this.setData({ journeyMessage: '请从搜索结果或地图选择完整的起点和终点。' })
      this.setSheetSnap('half', false)
      this.showPlanningOverview(true)
    }
  },
  referenceCircles(): ReferenceCircle[] {
    const circles: ReferenceCircle[] = []
    if (['place', 'map', 'coordinate'].includes(this.data.originMode) && this.data.originCoordinate) {
      circles.push({ ...this.data.originCoordinate, color: '#2869d8', fillColor: '#2869d844', radius: 18, strokeWidth: 3 })
    }
    if (['place', 'map'].includes(this.data.destinationMode) && this.data.destinationCoordinate) {
      circles.push({ ...this.data.destinationCoordinate, color: '#854cc5', fillColor: '#854cc544', radius: 18, strokeWidth: 3 })
    }
    return circles
  },
  showPlanningOverview(fit = false) {
    this.setData({ showAllRoutes: true })
    this.showRoute(this.data.selectedRouteId, false)
    const mapCircles = this.referenceCircles()
    const version = this.cameraRequestVersion
    this.setData({ mapCircles, mapFitPoints: [
      ...this.data.mapFitPoints, ...mapCircles.map(({ latitude, longitude }) => ({ latitude, longitude })),
    ] }, () => { if (fit && version === this.cameraRequestVersion) this.fitMap() })
  },
  async handleUseLocation() {
    this.handleDismissKeyboard()
    this.setData({ viewMode: 'journey' })
    this.clearJourneys()
    const version = this.endpointRequestVersion
    const fallback = this.data.stopOptions.findIndex(({ id }) => id === this.confirmedOriginStopId)
    this.setData({ originAllowedVisits: null, locating: true, originMode: fallback >= 0 ? 'stop' : 'location', originCoordinate: null, locationMessage: '正在定位…', originPlaceDetails: '', originNearbyStops: [],
      originQuery: fallback >= 0 ? this.dataset?.stops.find(({ id }) => id === this.confirmedOriginStopId)?.name ?? '' : '当前位置' })
    try {
      const location = await locationService.getCurrentLocation()
      if (version !== this.endpointRequestVersion || !this.pageVisible) return
      this.setData({
        originMode: 'coordinate', originCoordinate: location.coordinate, originQuery: '当前位置', originPlaceDetails: '',
        originNearbyStops: nearbyStopViews(this.placeSearch?.nearby(location.coordinate) ?? []),
        locationMessage: `已使用本次定位结果${location.isApproximate ? '，定位精度较低，请核对候车位置' : ''}；接驳距离按直线估算。`,
      })
    } catch (error: unknown) {
      if (version === this.endpointRequestVersion && this.pageVisible) {
        this.setData({ locationMessage: error instanceof Error ? error.message : '定位失败，可继续选择上车站。' })
      }
    } finally {
      if (version === this.endpointRequestVersion && this.pageVisible) {
        this.setData({ locating: false })
        if (this.data.originMode === 'coordinate') this.replanIfReady()
      }
    }
  },

  handlePlanJourney() {
    this.setData({ viewMode: 'journey', planMessageVisible: true })
    if (this.data.locating) { this.setData({ journeyMessage: '请等待定位完成，或手动选择上车站。' }); return }
    if (this.data.originMode === 'search' || this.data.destinationMode === 'search') {
      this.setSheetSnap('full', false)
      this.setData({ journeyMessage: `请从搜索结果或地图选择${this.data.originMode === 'search' ? '起点' : '终点'}，输入文字尚未确认。` }); return
    }
    if (this.data.originMode === 'location') { void this.handleUseLocation(); return }
    try {
      const origin = this.data.originMode !== 'stop' && this.data.originCoordinate
        ? { kind: 'coordinate' as const, coordinate: this.data.originCoordinate }
        : { kind: 'stop' as const, stopId: this.data.stopOptions[this.data.originIndex]?.id }
      const destination = this.data.destinationMode !== 'stop' && this.data.destinationCoordinate
        ? { kind: 'coordinate' as const, coordinate: this.data.destinationCoordinate }
        : { kind: 'stop' as const, stopId: this.data.stopOptions[this.data.destinationIndex]?.id }
      const result = transitJourneyService.plan(
        { ...origin, ...(this.data.originAllowedVisits !== null ? { allowedVisits: this.data.originAllowedVisits } : {}) },
        { ...destination, ...(this.data.destinationAllowedVisits !== null ? { allowedVisits: this.data.destinationAllowedVisits } : {}) })
      const dataset = this.dataset!
      const name = (id: string) => dataset.stops.find((stop) => stop.id === id)?.name ?? '未知站点'
      const journeys: JourneyView[] = result.journeys.map((journey, index) => ({
        ...journey, title: journey.legs.length === 1 ? '直达' : '换乘一次',
        isRecommended: index === 0,
        distanceText: `乘车约 ${Math.round(journey.rideDistanceMeters)} 米`,
        connectionText: `接驳直线：上车前约 ${Math.round(journey.accessDistanceMeters)} 米 · 下车后约 ${Math.round(journey.egressDistanceMeters)} 米`,
        legs: journey.legs.map((leg) => ({
          ...leg, boardingName: name(leg.boardingStopId), alightingName: name(leg.alightingStopId),
          directionText: `先经${name(leg.stopIds[1] ?? leg.alightingStopId)}`,
          pathText: leg.stopIds.map(name).join(' → '),
        })),
      }))
      this.cameraRequestVersion += 1
      this.setData({ journeys, selectedJourneyId: '', journeyPreview: null, journeyMessage: result.message })
      if (journeys[0]) this.showJourney(journeys[0])
      else { this.setSheetSnap('half', false); this.showPlanningOverview(true) }
    } catch (error: unknown) {
      this.setData({ journeys: [], selectedJourneyId: '', journeyPreview: null, journeyMessage: error instanceof Error ? error.message : '暂不能生成乘车方案。' })
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
    if (this.data.focusedSearchField || this.data.keyboardHeight) {
      wx.hideKeyboard()
      this.setData({ focusedSearchField: '', keyboardHeight: 0 })
    }
    this.setSheetSnap('peek', false)
    const version = ++this.cameraRequestVersion
    const points = journey.legs.flatMap((leg) => leg.points)
    const mapCircles = this.referenceCircles()
    this.rememberedJourneyId = journey.id
    this.setData({
      focusedSearchField: '', keyboardHeight: 0,
      journeyPreview: { title: journey.title, boardingName: journey.legs[0].boardingName,
        alightingName: journey.legs[journey.legs.length - 1].alightingName, routeText: journey.legs.map(({ routeName }) => routeName).join(' → '),
        distanceText: journey.distanceText, connectionText: journey.connectionText },
      selectedStation: null, viewMode: 'journey', mapLegend: journey.legs.map(({ routeId, routeName: name, color }) => ({ routeId, name, color })),
      selectedJourneyId: journey.id, mapTitle: '所选乘车区间', stopMessage: '', routeWarnings: [...journey.warnings],
      mapPolylines: journey.legs.map((leg) => ({ points: leg.points, color: leg.color, width: 8, arrowLine: true })),
      mapMarkers: [...markers.values()], mapCircles, mapFitPoints: [
        ...points, ...[...markers.values()].map(({ latitude, longitude }) => ({ latitude, longitude })),
        ...mapCircles.map(({ latitude, longitude }) => ({ latitude, longitude })),
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
    if (!stop || !this.pageVisible || this.data.mapSelectionField) return
    const station = this.stations.find((item) => item.id === stop.stationId || item.stopIds.includes(stop.stopId))
    if (!station) return
    this.handleDismissKeyboard()
    this.setData({ selectedStation: station, dataNotesExpanded: false, focusedSearchField: '', activeSearchField: '', searchResults: [],
      stopMessage: `${station.routes.length}条发布线路 · 候车位置请结合现场确认`, sheetScrollTarget: '' })
    // Keep an exact itinerary pin when opened from a ride; no recentering to the group anchor.
    this.moveViewport({ latitude: stop.latitude, longitude: stop.longitude }, 17)
    this.setSheetSnap('half', false, () => this.fitMap([
      { latitude: stop.latitude - 0.00025, longitude: stop.longitude - 0.00025 },
      { latitude: stop.latitude + 0.00025, longitude: stop.longitude + 0.00025 },
    ]))
  },
  handleCloseStation() {
    this.setData({ selectedStation: null, stopMessage: '' })
    this.setSheetSnap('peek', false)
  },
  handleUseStation(event: WechatMiniprogram.TouchEvent) {
    const field = endpointField(event.currentTarget.dataset.field)
    const station = this.data.selectedStation
    if (!field || !station || !station.canBoard) return
    this.setData({ selectedStation: null, viewMode: 'journey' })
    this.setSheetSnap('full', false)
    this.commitCampusPlace(field, station.coordinate, station.label, '统一站区参考位置，自动比较附近线路；实际乘降点以方案为准。')
  },
  handleUseStationDirection(event: WechatMiniprogram.TouchEvent) {
    const field = endpointField(event.currentTarget.dataset.field)
    const station = this.data.selectedStation
    const direction = station?.directions.find((item) => item.id === event.currentTarget.dataset.directionId)
    if (!field || !station || !direction || !(field === 'origin' ? direction.canDepart : direction.canArrive)) return
    this.setData({ selectedStation: null, viewMode: 'journey' })
    this.setSheetSnap('full', false)
    this.commitCampusPlace(field, station.coordinate, `${station.label} · ${direction.label}`,
      `${direction.hint}。仅限制发布轨迹参考顺序，实际站位与运营方向请现场核对。`, undefined, direction.allowedVisits)
  },
  handleUseStationVisit(event: WechatMiniprogram.TouchEvent) {
    const field = endpointField(event.currentTarget.dataset.field)
    const visit = this.data.selectedStation?.routes.flatMap((route) => route.visits).find((item) => item.key === event.currentTarget.dataset.visitKey)
    if (!field || !visit) return
    if (!visit.canBoard) { this.setData({ stopMessage: '该线路位置待核对，暂不作为乘降点。' }); return }
    const index = this.data.stopOptions.findIndex((item) => item.id === visit.stopId)
    if (index < 0) return
    this.setData({ selectedStation: null, viewMode: 'journey' })
    this.setSheetSnap('full', false)
    const change = { detail: { value: String(index) } } as WechatMiniprogram.PickerChange
    if (field === 'origin') this.handleOriginChange(change)
    else this.handleDestinationChange(change)
    this.replanIfReady()
  },
})
