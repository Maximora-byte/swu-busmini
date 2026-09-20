import type { BusDirection, BusRoute, BusStop } from '../../models/index'

export interface RouteSourceAssignment {
  routeId: string
  source: string
  status: string
}

export interface RouteDataSource {
  id: string
}

export type RouteDataValidationScope = 'route' | 'data' | 'stops' | 'sources'

export type RouteDataValidationIssueCode =
  | 'unknown_stop'
  | 'duplicate_stop'
  | 'loop_not_closed'
  | 'non_loop_closed'
  | 'invalid_repeat_declaration'
  | 'empty_direction'
  | 'empty_route'
  | 'missing_direction_name'
  | 'missing_source'
  | 'duplicate_route_id'
  | 'duplicate_stop_id'
  | 'duplicate_source_id'
  | 'unknown_source'
  | 'unknown_route_source_assignment'
  | 'duplicate_route_source_assignment'

export interface RouteDataValidationIssue {
  code: RouteDataValidationIssueCode
  scope: RouteDataValidationScope
  routeId?: string
  routeName?: string
  directionName?: string
  stopId?: string
  sourceId?: string
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
    scope: 'route',
    routeId: route.id,
    routeName: route.name,
    directionName: direction?.name,
    stopId,
    message,
  }
}

function globalIssue(
  scope: Exclude<RouteDataValidationScope, 'route'>,
  code: RouteDataValidationIssueCode,
  message: string,
  details: Pick<
    RouteDataValidationIssue,
    'routeId' | 'stopId' | 'sourceId'
  > = {},
): RouteDataValidationIssue {
  return { code, scope, message, ...details }
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

    if (direction.stopIds.length === 0) {
      if (route.serviceType === 'fixed_stop') {
        issues.push(
          issue(
            route,
            'empty_direction',
            `Route ${route.name} direction ${directionLabel} has no stops`,
            direction,
          ),
        )
      }
      const declaredRepeatedStopIds = direction.allowedRepeatedStopIds ?? []
      if (!direction.isLoop && declaredRepeatedStopIds.length > 0) {
        issues.push(
          issue(
            route,
            'invalid_repeat_declaration',
            `Route ${route.name} direction ${directionLabel} declares repeated stops but is not a loop`,
            direction,
          ),
        )
      }
      for (const stopId of declaredRepeatedStopIds) {
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
      continue
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
    if (
      !direction.isLoop &&
      direction.stopIds.length > 1 &&
      firstStopId === lastStopId
    ) {
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
  sources: readonly RouteDataSource[],
  routeSources: readonly RouteSourceAssignment[],
): RouteDataValidationResult {
  const issues: RouteDataValidationIssue[] = []
  const routeIds = new Set<string>()
  const stopIds = new Set<string>()
  const sourceIds = new Set<string>()

  for (const route of routes) {
    if (routeIds.has(route.id)) {
      issues.push(
        globalIssue(
          'data',
          'duplicate_route_id',
          `Duplicate route id: ${route.id}`,
          { routeId: route.id },
        ),
      )
    }
    routeIds.add(route.id)
  }

  for (const stop of stops) {
    if (stopIds.has(stop.id)) {
      issues.push(
        globalIssue(
          'stops',
          'duplicate_stop_id',
          `Duplicate stop id: ${stop.id}`,
          { stopId: stop.id },
        ),
      )
    }
    stopIds.add(stop.id)
  }

  for (const source of sources) {
    if (sourceIds.has(source.id)) {
      issues.push(
        globalIssue(
          'sources',
          'duplicate_source_id',
          `Duplicate source id: ${source.id}`,
          { sourceId: source.id },
        ),
      )
    }
    sourceIds.add(source.id)
  }

  issues.push(...routes.flatMap((route) => validateRoute(route, stops)))

  const sourceAssignmentsByRouteId = new Map<string, RouteSourceAssignment[]>()
  const assignmentKeys = new Set<string>()

  for (const assignment of routeSources) {
    const assignments = sourceAssignmentsByRouteId.get(assignment.routeId) ?? []
    assignments.push(assignment)
    sourceAssignmentsByRouteId.set(assignment.routeId, assignments)

    const assignmentKey = `${assignment.routeId}\u0000${assignment.source}`
    if (assignmentKeys.has(assignmentKey)) {
      issues.push(
        globalIssue(
          'sources',
          'duplicate_route_source_assignment',
          `Duplicate route source assignment: ${assignment.routeId} + ${assignment.source}`,
          { routeId: assignment.routeId, sourceId: assignment.source },
        ),
      )
    }
    assignmentKeys.add(assignmentKey)

    if (!routeIds.has(assignment.routeId)) {
      issues.push(
        globalIssue(
          'sources',
          'unknown_route_source_assignment',
          `Route source assignment references unknown route ${assignment.routeId}`,
          { routeId: assignment.routeId, sourceId: assignment.source },
        ),
      )
    }
    if (
      assignment.source.trim().length > 0 &&
      !sourceIds.has(assignment.source)
    ) {
      issues.push(
        globalIssue(
          'sources',
          'unknown_source',
          `Route ${assignment.routeId} references unknown source ${assignment.source}`,
          { routeId: assignment.routeId, sourceId: assignment.source },
        ),
      )
    }

    if (
      routeIds.has(assignment.routeId) &&
      (assignment.source.trim().length === 0 ||
        assignment.status.trim().length === 0)
    ) {
      const route = routes.find(({ id }) => id === assignment.routeId)
      if (route) {
        issues.push(
          issue(
            route,
            'missing_source',
            `Route ${route.name} source assignment must have non-empty source and status`,
          ),
        )
      }
    }
  }

  for (const route of routes) {
    const hasCompleteSource = (
      sourceAssignmentsByRouteId.get(route.id) ?? []
    ).some(
      ({ source, status }) =>
        source.trim().length > 0 && status.trim().length > 0,
    )
    const alreadyReported = issues.some(
      ({ code, routeId }) => code === 'missing_source' && routeId === route.id,
    )
    if (!hasCompleteSource && !alreadyReported) {
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
