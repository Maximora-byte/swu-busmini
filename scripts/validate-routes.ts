import { pois } from '../miniprogram/data/pois'
import { routes as routeRecords } from '../miniprogram/data/routes'
import sourcesData from '../miniprogram/data/sources.json'
import { stops as stopRecords } from '../miniprogram/data/stops'
import { routeGeometries } from '../miniprogram/data/route-geometries'
import type { BusStop } from '../miniprogram/models/index'
import { createCoordinateVerificationService } from '../miniprogram/services/location/coordinate-verification.service'
import { createStaticBusStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { createStaticCoordinateReviewRepository } from '../miniprogram/services/repository/coordinate-review.repository'
import { createReviewedBusStopRepository } from '../miniprogram/services/repository/reviewed-bus-stop.repository'
import { coordinateReviews as coordinateReviewRecords } from '../miniprogram/data/coordinate-reviews'
import { parseRouteData } from '../miniprogram/services/repository/route-data.parser'
import {
  type PoiDataValidationIssue,
  validatePoiData,
} from '../miniprogram/services/validation/poi-data-validator'
import {
  type RouteDataValidationIssue,
  validateRouteData,
} from '../miniprogram/services/validation/route-data-validator'
import { validateRouteGeometryData } from '../miniprogram/services/validation/route-geometry-validator'

const routes = parseRouteData(routeRecords)
const stops: readonly BusStop[] = stopRecords

function formatIssue(issue: RouteDataValidationIssue): string {
  if (issue.code === 'duplicate_stop' && issue.stopId) {
    const stop = stops.find(({ id }) => id === issue.stopId)
    return `duplicated stop: ${stop?.name ?? issue.stopId} (${issue.stopId})`
  }
  if (issue.code === 'unknown_stop' && issue.stopId) {
    return `unknown stop: ${issue.stopId}`
  }
  if (issue.code === 'missing_source') {
    return 'missing source or status'
  }
  if (issue.code === 'duplicate_route_id') {
    return `duplicate route id: ${issue.routeId ?? '(missing)'}`
  }
  if (issue.code === 'duplicate_stop_id') {
    return `duplicate stop id: ${issue.stopId ?? '(missing)'}`
  }
  if (issue.code === 'duplicate_source_id') {
    return `duplicate source id: ${issue.sourceId ?? '(missing)'}`
  }
  if (issue.code === 'unknown_source') {
    return `unknown source: ${issue.sourceId ?? '(missing)'}`
  }
  if (issue.code === 'unknown_route_source_assignment') {
    return `source assignment references unknown route: ${issue.routeId ?? '(missing)'}`
  }
  if (issue.code === 'duplicate_route_source_assignment') {
    return `duplicate route source assignment: ${issue.routeId ?? '(missing)'} + ${issue.sourceId ?? '(missing)'}`
  }
  return issue.message
}

function formatPoiIssue(issue: PoiDataValidationIssue): string {
  if (issue.code === 'unknown_stop') {
    return `unknown stop: ${issue.stopId ?? '(missing)'}`
  }
  if (issue.code === 'duplicate_poi_id') {
    return `duplicate POI id: ${issue.poiId ?? '(missing)'}`
  }
  if (issue.code === 'empty_alias') {
    return `empty alias: ${issue.poiId ?? '(missing)'}`
  }
  return issue.message
}

function main(): void {
  const coordinateReviewRepository = createStaticCoordinateReviewRepository(
    coordinateReviewRecords,
  )
  createReviewedBusStopRepository(
    createStaticBusStopRepository(stopRecords),
    createCoordinateVerificationService(coordinateReviewRepository),
  )
  const result = validateRouteData(
    routes,
    stops,
    sourcesData.sources,
    sourcesData.routeSources,
  )
  const poiResult = validatePoiData(pois, stops)
  const geometryResult = validateRouteGeometryData(routeGeometries, routes)

  for (const scope of ['data', 'stops', 'sources'] as const) {
    const scopedIssues = result.issues.filter((issue) => issue.scope === scope)
    if (scopedIssues.length === 0) {
      continue
    }
    console.error(`✗ ${scope}`)
    for (const validationIssue of scopedIssues) {
      console.error(`  ${formatIssue(validationIssue)}`)
    }
  }

  for (const route of routes) {
    const routeIssues = result.issues.filter(
      ({ routeId, scope }) => scope === 'route' && routeId === route.id,
    )
    if (routeIssues.length === 0) {
      console.log(`✓ ${route.name}`)
      continue
    }

    console.error(`✗ ${route.name}`)
    for (const validationIssue of routeIssues) {
      console.error(`  ${formatIssue(validationIssue)}`)
    }
  }

  if (poiResult.valid) {
    console.log('✓ pois')
  } else {
    console.error('✗ pois')
    for (const validationIssue of poiResult.issues) {
      console.error(`  ${formatPoiIssue(validationIssue)}`)
    }
  }

  console.log('✓ coordinate reviews')

  if (geometryResult.valid) {
    console.log('✓ route geometries')
  } else {
    console.error('✗ route geometries')
    for (const validationIssue of geometryResult.issues) {
      console.error(`  ${validationIssue.message}`)
    }
  }

  if (!result.valid || !poiResult.valid || !geometryResult.valid) {
    process.exitCode = 1
  }
}

try {
  main()
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown error'
  console.error('✗ static data')
  console.error(`  ${message}`)
  process.exitCode = 1
}
