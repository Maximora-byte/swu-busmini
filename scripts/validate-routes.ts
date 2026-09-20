import poisData from '../miniprogram/data/pois.json'
import routesData from '../miniprogram/data/routes.json'
import sourcesData from '../miniprogram/data/sources.json'
import stopsData from '../miniprogram/data/stops.json'
import type { BusStop } from '../miniprogram/models/index'
import { parseRouteData } from '../miniprogram/services/repository/route-data.parser'
import {
  type PoiDataValidationIssue,
  validatePoiData,
} from '../miniprogram/services/validation/poi-data-validator'
import {
  type RouteDataValidationIssue,
  validateRouteData,
} from '../miniprogram/services/validation/route-data-validator'

const routes = parseRouteData(routesData)
const stops: readonly BusStop[] = stopsData

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
  const result = validateRouteData(
    routes,
    stops,
    sourcesData.sources,
    sourcesData.routeSources,
  )
  const poiResult = validatePoiData(poisData, stops)

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

  if (!result.valid || !poiResult.valid) {
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
