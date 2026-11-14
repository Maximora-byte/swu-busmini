type PrivacyDecision = { event: 'agree'; buttonId: string } | { event: 'disagree' }
type PrivacyResolver = (decision: PrivacyDecision) => void
interface PrivacyOwner { setData(data: Record<string, unknown>): void }
interface PrivacyPrompt {
  owner: PrivacyOwner
  pending: Set<PrivacyResolver>
  attached: boolean
  generation: number
}

const prompts = new WeakMap<object, PrivacyPrompt>()
let currentPrompt: PrivacyPrompt | undefined

function settle(prompt: PrivacyPrompt, decision: PrivacyDecision): void {
  const pending = Array.from(prompt.pending)
  prompt.pending.clear()
  prompt.generation += 1
  prompt.owner.setData({ visible: false, contractError: '' })
  for (const resolve of pending) {
    // A disposed caller must not prevent the remaining privacy APIs from settling.
    try { resolve(decision) } catch { /* The callback was already disposed by its caller. */ }
  }
}

function receivePrivacyRequest(resolve: PrivacyResolver): void {
  const prompt = currentPrompt
  if (!prompt || !prompt.attached) {
    resolve({ event: 'disagree' })
    return
  }
  const first = prompt.pending.size === 0
  prompt.pending.add(resolve)
  if (!first) return
  const generation = ++prompt.generation
  prompt.owner.setData({ visible: true, contractName: '《小程序隐私保护指引》', contractError: '' })
  if (typeof wx.getPrivacySetting !== 'function') return
  wx.getPrivacySetting({
    success(result) {
      if (prompt.attached && prompt.generation === generation && prompt.pending.size && result.privacyContractName) {
        prompt.owner.setData({ contractName: result.privacyContractName })
      }
      // A setting query is never a user's agreement to this pending request.
    },
    fail() { /* Keep the readable fallback name and the explicit user choice. */ },
  })
}

Component({
  data: {
    visible: false,
    contractName: '《小程序隐私保护指引》',
    contractError: '',
  },
  lifetimes: {
    attached() {
      if (typeof wx.onNeedPrivacyAuthorization !== 'function') return
      const previous = currentPrompt
      // Release old owners before settling: callbacks may synchronously start another request.
      currentPrompt = undefined
      if (previous) settle(previous, { event: 'disagree' })
      const prompt: PrivacyPrompt = { owner: this, pending: new Set(), attached: true, generation: 0 }
      prompts.set(this, prompt)
      currentPrompt = prompt
      // The installed typings declare a result object here; the official API
      // passes a resolve function as the listener's first argument.
      const register = wx.onNeedPrivacyAuthorization as unknown as (listener: (resolve: PrivacyResolver) => void) => void
      register(receivePrivacyRequest)
    },
    detached() {
      const prompt = prompts.get(this)
      if (!prompt) return
      prompt.attached = false
      if (currentPrompt === prompt) currentPrompt = undefined
      settle(prompt, { event: 'disagree' })
      prompts.delete(this)
      // WeChat has no offNeedPrivacyAuthorization API. The dispatcher retains no
      // detached owner and refuses any request until another live owner attaches.
    },
  },
  methods: {
    hasPendingPrivacy(): boolean {
      const prompt = prompts.get(this)
      return !!prompt?.attached && currentPrompt === prompt && prompt.pending.size > 0
    },
    handleAgree(event: WechatMiniprogram.CustomEvent) {
      const prompt = prompts.get(this)
      if (!prompt?.attached || currentPrompt !== prompt || !prompt.pending.size) return
      if (event.type?.toLowerCase() !== 'agreeprivacyauthorization' || event.currentTarget.id !== 'privacy-agree') return
      settle(prompt, { event: 'agree', buttonId: 'privacy-agree' })
    },
    handleRefuse() {
      const prompt = prompts.get(this)
      if (prompt?.attached) settle(prompt, { event: 'disagree' })
    },
    handleOpenContract() {
      const unavailable = () => this.setData({ contractError: '暂时无法打开隐私保护指引，请稍后重试；也可暂不同意，继续浏览和搜索。' })
      if (typeof wx.openPrivacyContract !== 'function') { unavailable(); return }
      wx.openPrivacyContract({ fail: unavailable })
    },
    preventClose() { /* Keep taps inside the dialog from reaching the dismissing mask. */ },
  },
})
