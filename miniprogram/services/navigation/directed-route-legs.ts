import type { BusDirection, BusRoute, RouteServiceType } from '../../models/index'

/** 按已知站序能连续乘坐的一段；不涉及位置、耗时或步行。 */
export interface DirectedRouteLeg {
  routeId: string
  routeName: string
  directionId: string
  originStopId: string
  destinationStopId: string
  stopIds: string[]
  serviceType: RouteServiceType
}

export function compareDirectedRouteLegs(left: DirectedRouteLeg, right: DirectedRouteLeg): number {
  const difference = left.stopIds.length - right.stopIds.length
  if (difference) return difference
  const leftKey = JSON.stringify([left.routeId, left.directionId, left.originStopId, left.destinationStopId, left.stopIds])
  const rightKey = JSON.stringify([right.routeId, right.directionId, right.originStopId, right.destinationStopId, right.stopIds])
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
}

/**
 * 环线末尾的闭合站不算第二个起点；最多越过闭合点一次。
 * 相同起终站不形成有效路段；重复站的不同出现位置取参考段数较少者。
 */
export function findDirectedRouteLegs(
  route: BusRoute,
  direction: BusDirection,
  originStopIds: ReadonlySet<string>,
  destinationStopIds?: ReadonlySet<string>,
): DirectedRouteLeg[] {
  const closedLoop = direction.isLoop && direction.stopIds.length > 1 &&
    direction.stopIds[0] === direction.stopIds[direction.stopIds.length - 1]
  const sequence = closedLoop ? direction.stopIds.slice(0, -1) : direction.stopIds
  const legs = new Map<string, DirectedRouteLeg>()
  for (let start = 0; start < sequence.length; start += 1) {
    const originStopId = sequence[start]
    if (!originStopIds.has(originStopId)) continue
    const maxSteps = closedLoop ? sequence.length - 1 : sequence.length - start - 1
    const path = [originStopId]
    for (let step = 1; step <= maxSteps; step += 1) {
      const destinationStopId = sequence[(start + step) % sequence.length]
      path.push(destinationStopId)
      if (originStopId === destinationStopId ||
        (destinationStopIds && !destinationStopIds.has(destinationStopId))) continue
      const leg: DirectedRouteLeg = {
        routeId: route.id, routeName: route.name, directionId: direction.name,
        originStopId, destinationStopId, stopIds: [...path], serviceType: route.serviceType,
      }
      const key = JSON.stringify([originStopId, destinationStopId])
      const previous = legs.get(key)
      if (!previous || compareDirectedRouteLegs(leg, previous) < 0) legs.set(key, leg)
    }
  }
  // 排序依据仅为参考站序段数，并不等同于距离或时间。
  return [...legs.values()].sort(compareDirectedRouteLegs)
}
