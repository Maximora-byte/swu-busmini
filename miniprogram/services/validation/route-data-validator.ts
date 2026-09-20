import type { BusDirection, BusRoute, BusStop } from '../../models/index'

export interface RouteSourceAssignment {
  routeId: string
  source: string
  status: string
}

export type RouteDataValidationIssueCode =
  | 'unknown_stop'
  | 'duplicate_stop'
  | 'loop_not_closed'
  | 'non_loop_closed'
  | 'invalid_repeat_declaration'
  | 'empty_route'
  | 'missing_direction_name'
  | 'missing_source'

export interface RouteDataValidationIssue {
  code: RouteDataValidationIssueCode
  routeId: string
  routeName: string
  directionName?: string
  stopId?: string
  message: string
}

export interface RouteDataValidationResult {
  valid: boolean
  issues: readonly RouteDataValidationIssue[]
}

function issue(
  route: BusRoute,
  code: RouteDataValidationIssueCode,
  message: string,
  direction?: BusDirection,
  stopId?: string,
): RouteDataValidationIssue {
  return {
    code,
    routeId: route.id,
    routeName: route.name,
    directionName: direction?.name,
    stopId,
    message,
  }
}

export function validateRoute(
  route: BusRoute,
  stops: readonly BusStop[],
): readonly RouteDataValidationIssue[] {
  const issues: RouteDataValidationIssue[] = []
  const knownStopIds = new Set(stops.map(({ id }) => id))

  if (route.directions.length === 0) {
    issues.push(
      issue(route, 'empty_route', `Route ${route.name} has no directions`),
    )
    return issues
  }

  for (const direction of route.directions) {
    const directionLabel = direction.name.trim() || '(unnamed)'
    if (direction.name.trim().length === 0) {
      issues.push(
        issue(
          route,
          'missing_direction_name',
          `Route ${route.name} has a direction without a name`,
          direction,
        ),
      )
    }

    const stopIdCounts = new Map<string, number>()
    for (const stopId of direction.stopIds) {
      stopIdCounts.set(stopId, (stopIdCounts.get(stopId) ?? 0) + 1)
      if (!knownStopIds.has(stopId)) {
        issues.push(
          issue(
            route,
            'unknown_stop',
            `Route ${route.name} references unknown stop ${stopId}`,
            direction,
            stopId,
          ),
        )
      }
    }

    const firstStopId = direction.stopIds[0]
    const lastStopId = direction.stopIds[direction.stopIds.length - 1]
    if (direction.isLoop && firstStopId !== lastStopId) {
      issues.push(
        issue(
          route,
          'loop_not_closed',
          `Route ${route.name} direction ${directionLabel} is marked as a loop but is not closed`,
          direction,
        ),
      )
    }
    if (!direction.isLoop && firstStopId === lastStopId) {
      issues.push(
        issue(
          route,
          'non_loop_closed',
          `Route ${route.name} direction ${directionLabel} returns to its first stop but is not marked as a loop`,
          direction,
          firstStopId,
        ),
      )
    }

    const allowedRepeatedStopIds = new Set(
      direction.allowedRepeatedStopIds ?? [],
    )
    if (!direction.isLoop && allowedRepeatedStopIds.size > 0) {
      issues.push(
        issue(
          route,
          'invalid_repeat_declaration',
          `Route ${route.name} direction ${directionLabel} declares repeated stops but is not a loop`,
          direction,
        ),
      )
    }

    for (const stopId of allowedRepeatedStopIds) {
      if ((stopIdCounts.get(stopId) ?? 0) < 2) {
        issues.push(
          issue(
            route,
            'invalid_repeat_declaration',
            `Route ${route.name} direction ${directionLabel} allows stop ${stopId}, but it is not repeated`,
            direction,
            stopId,
          ),
        )
      }
    }

    for (const [stopId, count] of stopIdCounts) {
      if (count < 2) {
        continue
      }
      const isSimpleLoopClosure =
        direction.isLoop &&
        stopId === firstStopId &&
        stopId === lastStopId &&
        count === 2
      if (!isSimpleLoopClosure && !allowedRepeatedStopIds.has(stopId)) {
        issues.push(
          issue(
            route,
            'duplicate_stop',
            `Route ${route.name} direction ${directionLabel} duplicates stop ${stopId}`,
            direction,
            stopId,
          ),
        )
      }
    }
  }

  return issues
}

export function validateRouteData(
  routes: readonly BusRoute[],
  stops: readonly BusStop[],
  routeSources: readonly RouteSourceAssignment[],
): RouteDataValidationResult {
  const issues = routes.flatMap((route) => validateRoute(route, stops))
  const sourceAssignmentsByRouteId = new Map<string, RouteSourceAssignment[]>()

  for (const assignment of routeSources) {
    const assignments = sourceAssignmentsByRouteId.get(assignment.routeId) ?? []
    assignments.push(assignment)
    sourceAssignmentsByRouteId.set(assignment.routeId, assignments)
  }

  for (const route of routes) {
    const hasCompleteSource = (
      sourceAssignmentsByRouteId.get(route.id) ?? []
    ).some(
      ({ source, status }) =>
        source.trim().length > 0 && status.trim().length > 0,
    )
    if (!hasCompleteSource) {
      issues.push(
        issue(
          route,
          'missing_source',
          `Route ${route.name} is missing source or status metadata`,
        ),
      )
    }
  }

  return { valid: issues.length === 0, issues }
}
