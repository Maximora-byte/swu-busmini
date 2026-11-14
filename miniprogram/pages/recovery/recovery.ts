import { retryHome } from '../../services/error/error-recovery'

// No route repositories, location APIs or search state are needed to render this page.
Page({
  retryGeneration: 0,
  data: {
    message: '页面暂时遇到问题，请尝试重新打开首页。',
    retrying: false,
    retryError: '',
  },
  onLoad(query: { reason?: string } = {}) {
    this.setData({
      message: query.reason === 'page-not-found'
        ? '未找到要打开的页面，请返回首页继续使用。'
        : '页面暂时遇到问题，请尝试重新打开首页。',
    })
  },
  onUnload() { this.retryGeneration += 1 },
  handleRetry() {
    if (this.data.retrying) return
    const generation = ++this.retryGeneration
    this.setData({ retrying: true, retryError: '' })
    retryHome((succeeded) => {
      if (generation !== this.retryGeneration) return
      this.setData({
        retrying: false,
        retryError: succeeded ? '' : '打开首页失败，请点击重试；若仍无法打开，请关闭小程序后重新打开。',
      })
    })
  },
})
