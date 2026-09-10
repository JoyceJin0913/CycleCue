import { callApi } from '../../services/api-client'
import type { CareInviteDto, CareListDto, TodayViewState } from '../../services/api-types'
import {
  registerAcceptedCareOverdueSubscription,
  requestCareOverdueSubscription,
} from '../../services/subscription'
import { runtimeConfig } from '../../config/runtime'
import { formatShortLocalDate } from '../../utils/display'

type WatchingView = CareListDto['watching'][number] & {
  statusText: string
  reminderText: string
}

const statusText: Record<TodayViewState, string> = {
  before_start: '计划尚未开始',
  break: '今天是停药日',
  future: '今天尚未到记录时间',
  unrecorded_overdue: '今天尚未记录',
  taken: '今天已记录',
  not_taken: '今天记录为未服',
}

function statusForToday(today: NonNullable<CareListDto['watching'][number]['today']>): string {
  if (today.planStatus === 'placebo') {
    if (today.viewState === 'future') return '今天需要服用白色片'
    if (today.viewState === 'unrecorded_overdue') return '白色片尚未记录'
  }
  return statusText[today.viewState]
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    ownerLabel: '我',
    caregivers: [] as CareListDto['caregivers'],
    watching: [] as WatchingView[],
    remainingInviteSlots: 0,
    reminderTemplateConfigured: false,
    inviteToken: '',
    generatingInvite: false,
    busyRelationshipId: '',
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
          statusText: item.today ? statusForToday(item.today) : '对方尚未设置计划',
          reminderText: item.reminder.covered
            ? `${formatShortLocalDate(item.reminder.localDate ?? '', item.today?.localDate)} ${item.reminder.scheduledLocalTime}`
            : '',
        })),
        reminderTemplateConfigured: data.reminderTemplateConfigured && Boolean(runtimeConfig.careOverdueTemplateId),
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

  async setOverduePermission(event: WechatMiniprogram.SwitchChange) {
    const relationshipId = String(event.currentTarget.dataset.id ?? '')
    const enabled = Boolean(event.detail.value)
    if (!relationshipId || this.data.busyRelationshipId) return
    this.setData({ busyRelationshipId: relationshipId, errorMessage: '' })
    try {
      await callApi('care.overduePermission.set', { relationshipId, enabled })
      wx.showToast({ title: enabled ? '已允许朋友提醒' : '已关闭朋友提醒', icon: 'none' })
    } catch (error) {
      this.setData({ errorMessage: error instanceof Error ? error.message : '修改提醒权限失败' })
    } finally {
      this.setData({ busyRelationshipId: '' })
      await this.refresh()
    }
  },

  async enableCareReminder(event: WechatMiniprogram.TouchEvent) {
    const relationshipId = String(event.currentTarget.dataset.id ?? '')
    if (!relationshipId || this.data.busyRelationshipId) return
    if (!this.data.reminderTemplateConfigured) {
      await wx.showModal({
        title: '朋友提醒正在配置',
        content: '需要先在微信公众平台添加一条适合朋友接收的记录提醒模板。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }

    this.setData({ busyRelationshipId: relationshipId, errorMessage: '' })
    const choice = await requestCareOverdueSubscription()
    if (choice === 'accept') {
      const registered = await registerAcceptedCareOverdueSubscription(relationshipId)
      wx.showToast({ title: registered ? '下一次提醒已开启' : '提醒同步失败', icon: 'none' })
    } else if (choice === 'reject' || choice === 'ban' || choice === 'filter') {
      wx.showToast({ title: '没有开启提醒', icon: 'none' })
    } else {
      wx.showToast({ title: '暂时无法申请提醒', icon: 'none' })
    }
    this.setData({ busyRelationshipId: '' })
    await this.refresh()
  },

  async disableCareReminder(event: WechatMiniprogram.TouchEvent) {
    const relationshipId = String(event.currentTarget.dataset.id ?? '')
    if (!relationshipId || this.data.busyRelationshipId) return
    const result = await wx.showModal({
      title: '关闭下一次提醒？',
      content: '关闭后，这次尚未使用的朋友提醒不会再发送。',
      confirmText: '关闭提醒',
      confirmColor: '#8a4f4f',
    })
    if (!result.confirm) return
    this.setData({ busyRelationshipId: relationshipId, errorMessage: '' })
    try {
      await callApi('care.reminder.disable', { relationshipId })
      wx.showToast({ title: '提醒已关闭', icon: 'none' })
    } catch (error) {
      this.setData({ errorMessage: error instanceof Error ? error.message : '关闭提醒失败' })
    } finally {
      this.setData({ busyRelationshipId: '' })
      await this.refresh()
    }
  },

  async removeRelationship(event: WechatMiniprogram.TouchEvent) {
    const relationshipId = String(event.currentTarget.dataset.id ?? '')
    const role = String(event.currentTarget.dataset.role ?? '')
    if (!relationshipId || this.data.busyRelationshipId) return
    const result = await wx.showModal({
      title: role === 'owner' ? '移除这位朋友？' : '停止关注？',
      content: '关系结束后，将无法继续查看状态或接收提醒。',
      confirmText: role === 'owner' ? '确认移除' : '停止关注',
      confirmColor: '#8a4f4f',
    })
    if (!result.confirm) return
    this.setData({ busyRelationshipId: relationshipId, errorMessage: '' })
    try {
      await callApi('care.link.remove', { relationshipId })
      wx.showToast({ title: '已结束关注关系', icon: 'none' })
    } catch (error) {
      this.setData({ errorMessage: error instanceof Error ? error.message : '操作失败，请重试' })
    } finally {
      this.setData({ busyRelationshipId: '' })
      await this.refresh()
    }
  },
})
