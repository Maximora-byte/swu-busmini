import sourcesData from '../miniprogram/data/sources.json'
import { busStopRepository } from '../miniprogram/services/repository/bus-stop.repository'
import { routeRepository } from '../miniprogram/services/repository/route.repository'
import {
  type RouteDataValidationIssue,
  validateRouteData,
} from '../miniprogram/services/validation/route-data-validator'

function formatIssue(issue: RouteDataValidationIssue): string {
  if (issue.code === 'duplicate_stop' && issue.stopId) {
    const stop = busStopRepository.findById(issue.stopId)
    return `duplicated stop: ${stop?.name ?? issue.stopId} (${issue.stopId})`
  }
  if (issue.code === 'unknown_stop' && issue.stopId) {
    return `unknown stop: ${issue.stopId}`
  }
  if (issue.code === 'missing_source') {
    return 'missing source or status'
  }
  return issue.message
}

function main(): void {
  const routes = routeRepository.getAll()
  const result = validateRouteData(
    routes,
    busStopRepository.getAll(),
    sourcesData.routeSources,
  )

  for (const route of routes) {
    const routeIssues = result.issues.filter(
      ({ routeId }) => routeId === route.id,
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

  if (!result.valid) {
    process.exitCode = 1
  }
}

try {
  main()
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown error'
  console.error('✗ route data')
  console.error(`  ${message}`)
  process.exitCode = 1
}
