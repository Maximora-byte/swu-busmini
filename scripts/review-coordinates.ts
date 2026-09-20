import { coordinateVerificationService } from '../miniprogram/services/location/coordinate-verification.service'

function main(): void {
  const pendingReviews = coordinateVerificationService.getPendingReviews()
  if (pendingReviews.length === 0) {
    console.log('没有待确认坐标。')
    return
  }

  console.log(
    JSON.stringify(
      {
        count: pendingReviews.length,
        pendingReviews,
      },
      null,
      2,
    ),
  )
}

main()
