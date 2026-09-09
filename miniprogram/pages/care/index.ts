import { callApi } from '../../services/api-client'
import type { CareInviteDto, CareListDto, TodayViewState } from '../../services/api-types'

const statusText: Record<TodayViewState, string> = {
  before_start: '计划尚未开始',
  break: '今天是停药日',
  future: '今天尚未到记录时间',
  unrecorded_overdue: '今天尚未记录',
  taken: '今天已记录',
  not_taken: '今天记录为未服',
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    ownerLabel: '我',
    caregivers: [] as CareListDto['caregivers'],
    watching: [] as Array<CareListDto['watching'][number] & { statusText: string }>,
    remainingInviteSlots: 0,
    inviteToken: '',
    generatingInvite: false,
  },

  onShow() {
    void this.refresh()
  },

  onPullDownRefresh() {
    void this.refresh().finally(() => wx.stopPullDownRefresh())
  },

  onShareAppMessage() {
    return {
      title: `${this.data.ownerLabel || '一位朋友'}邀请你关注每日记录`,
      path: `/pages/invite/index?t=${this.data.inviteToken}`,
    }
  },

  onOwnerLabelInput(event: WechatMiniprogram.Input) {
    this.setData({ ownerLabel: String(event.detail.value).slice(0, 12), inviteToken: '' })
  },

  async refresh() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const data = await callApi<CareListDto>('care.list')
      this.setData({
        loading: false,
        caregivers: data.caregivers,
        watching: data.watching.map((item) => ({
          ...item,
          statusText: item.today ? statusText[item.today.viewState] : '对方尚未设置计划',
        })),
        remainingInviteSlots: data.remainingInviteSlots,
      })
    } catch (error) {
      this.setData({ loading: false, errorMessage: error instanceof Error ? error.message : '读取朋友列表失败' })
    }
  },

  async prepareInvite() {
    if (this.data.generatingInvite || this.data.remainingInviteSlots <= 0) return
    this.setData({ generatingInvite: true, errorMessage: '' })
    try {
      const invite = await callApi<CareInviteDto>('care.invite.create', { ownerLabel: this.data.ownerLabel })
      this.setData({ inviteToken: invite.token })
      wx.showToast({ title: '邀请已生成', icon: 'success' })
    } catch (error) {
      this.setData({ errorMessage: error instanceof Error ? error.message : '生成邀请失败' })
    } finally {
      this.setData({ generatingInvite: false })
    }
  },
})
