type RecoveryReason = 'runtime' | 'promise' | 'page-not-found'

const RECOVERY_ROUTE = 'pages/recovery/recovery'
const HOME_URL = '/pages/journey/journey?view=map'
let recoveryOpen = false

function showRestartPrompt(): void {
  try {
    wx.showModal({
      title: '暂时无法打开页面',
      content: '请关闭小程序后重新打开。',
      showCancel: false,
    })
  } catch {
    // Native UI can also be unavailable; do not turn its failure into another error.
  }
}

export function openRecovery(reason: RecoveryReason): void {
  if (recoveryOpen) return
  try {
    const pages = getCurrentPages()
    if (pages[pages.length - 1]?.route === RECOVERY_ROUTE) return
  } catch {
    // A page may not exist yet when a page module fails during startup.
  }
  recoveryOpen = true
  try {
    wx.reLaunch({
      url: `/${RECOVERY_ROUTE}?reason=${reason}`,
      success: () => { recoveryOpen = false },
      // Leave a failed recovery latched so repeated errors cannot create prompt loops.
      fail: showRestartPrompt,
    })
  } catch {
    showRestartPrompt()
  }
}

/** An explicit retry also clears a failed recovery gate. Never replay a failed URL. */
export function retryHome(complete: (succeeded: boolean) => void): void {
  recoveryOpen = false
  // The visible recovery route already blocks recursion. A late failure must not
  // suppress errors after another navigation has independently left that page.
  const fail = () => complete(false)
  try {
    wx.reLaunch({ url: HOME_URL, success: () => complete(true), fail })
  } catch {
    fail()
  }
}
