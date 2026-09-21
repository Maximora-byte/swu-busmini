import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import routeGeometriesData from '../miniprogram/data/route-geometries.json'
import { createRouteGeometryReviewService } from '../miniprogram/services/map/route-geometry-review.service'
import { reviewedBusStopRepository } from '../miniprogram/services/repository/reviewed-bus-stop.repository'
import { createStaticRouteGeometryRepository } from '../miniprogram/services/repository/route-geometry.repository'
import { routeRepository } from '../miniprogram/services/repository/route.repository'

const geometryPath = fileURLToPath(
  new URL('../miniprogram/data/route-geometries.json', import.meta.url),
)

type ReviewAction = 'approve' | 'reject'

function isReviewAction(value: string | undefined): value is ReviewAction {
  return value === 'approve' || value === 'reject'
}

function printRouteReview(routeId: string): void {
  const route = routeRepository.findById(routeId)
  if (!route) {
    throw new Error(`未找到线路: ${routeId}`)
  }
  const repository = createStaticRouteGeometryRepository(
    routeGeometriesData,
    routeRepository,
  )
  const verifiedStopIds = new Set(
    reviewedBusStopRepository.getVerifiedStops().map(({ id }) => id),
  )

  console.log(`线路: ${route.name}`)
  for (const direction of route.directions) {
    const stops = reviewedBusStopRepository.getByIds(direction.stopIds)
    const firstStop = stops[0]
    const lastStop = stops[stops.length - 1]
    const geometry = repository.getGeometry(routeId, direction.name)
    const missingStopIds = [
      ...new Set(
        direction.stopIds.filter((stopId) => !verifiedStopIds.has(stopId)),
      ),
    ]

    console.log(
      `方向: ${direction.name}（${firstStop?.name ?? '?'} → ${lastStop?.name ?? '?'}）`,
    )
    console.log(`轨迹状态: ${geometry?.dataStatus ?? 'missing'}`)
    console.log(`点数量: ${geometry?.points.length ?? 0}`)
    if (missingStopIds.length > 0) {
      console.log(`missing coordinate: ${missingStopIds.join(', ')}`)
    }
  }
}

async function main(): Promise<void> {
  const routeId = process.argv[2]?.trim() || 'route_1'
  const action = process.argv[3]
  const directionId = process.argv.slice(4).join(' ').trim()

  if (action === undefined) {
    printRouteReview(routeId)
    return
  }
  if (!isReviewAction(action) || directionId.length === 0) {
    throw new Error(
      '用法: npm run review:geometry [route_1] [approve|reject] "方向名称"',
    )
  }

  const repository = createStaticRouteGeometryRepository(
    routeGeometriesData,
    routeRepository,
  )
  const review = createRouteGeometryReviewService(repository)
  const current = repository.getAll()
  const updated =
    action === 'approve'
      ? review.approve(current, routeId, directionId)
      : review.reject(current, routeId, directionId)
  await writeFile(
    geometryPath,
    `${JSON.stringify(updated, null, 2)}\n`,
    'utf8',
  )
  console.log(
    action === 'approve'
      ? `已人工确认轨迹: ${routeId}/${directionId}`
      : `已拒绝并移除候选轨迹: ${routeId}/${directionId}`,
  )
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '未知错误'
  console.error(`线路轨迹审核失败: ${message}`)
  process.exitCode = 1
})
