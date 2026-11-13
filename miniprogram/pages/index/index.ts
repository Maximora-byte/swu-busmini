/** Old saved links enter the unified current-data home; no historical planner is started here. */
Page({
  data: { targetUrl: '/pages/journey/journey?view=map', redirectError: '' },
  onLoad(query: { routeId?: string; view?: string } = {}) {
    const view = query.view === 'journey' ? 'journey' : 'map'
    const route = typeof query.routeId === 'string' && /^route_[a-z0-9_]{1,40}$/.test(query.routeId) ? query.routeId : ''
    this.setData({ targetUrl: `/pages/journey/journey?view=${view}${route ? `&routeId=${encodeURIComponent(route)}` : ''}` })
    this.handleRetry()
  },
  handleRetry() {
    this.setData({ redirectError: '' })
    wx.redirectTo({ url: this.data.targetUrl, fail: () => { this.setData({ redirectError: '打开首页失败，请点击重试。' }) } })
  },
})
