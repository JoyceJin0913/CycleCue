import { callApi } from '../../services/api-client'

interface InvitePreviewDto {
  ownerLabel: string
  expiresAt: string
}

Page({
  data: {
    token: '',
    ownerLabel: '',
    caregiverLabel: '',
    loading: true,
    joining: false,
    joined: false,
    errorMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const token = options.t ?? ''
    this.setData({ token })
    void this.previewInvite(token)
  },

  async previewInvite(token: string) {
    try {
      const preview = await callApi<InvitePreviewDto>('care.invite.preview', { token })
      this.setData({ loading: false, ownerLabel: preview.ownerLabel })
    } catch (error) {
      this.setData({ loading: false, errorMessage: error instanceof Error ? error.message : '邀请链接无效' })
    }
  },

  onLabelInput(event: WechatMiniprogram.Input) {
    this.setData({ caregiverLabel: String(event.detail.value).slice(0, 12) })
  },

  async claimInvite() {
    if (this.data.joining) return
    this.setData({ joining: true, errorMessage: '' })
    try {
      await callApi('care.invite.claim', {
        token: this.data.token,
        caregiverLabel: this.data.caregiverLabel,
      })
      this.setData({ joining: false, joined: true })
    } catch (error) {
      this.setData({ joining: false, errorMessage: error instanceof Error ? error.message : '加入失败，请重试' })
    }
  },

  openCarePage() {
    wx.switchTab({ url: '/pages/care/index' })
  },
})
