import { callApi, createRequestId } from '../../services/api-client'
import type { BootstrapDto, ReminderCoverageDto, TodayDto } from '../../services/api-types'
import {
  flushPendingSubscriptions,
  registerAcceptedSubscription,
  requestSelfDueSubscription,
} from '../../services/subscription'

const emptyToday: TodayDto = {
  localDate: '',
  displayDate: '',
  planStatus: 'before_start',
  viewState: 'before_start',
  cycleDay: null,
  scheduledLocalTime: '',
  nextActiveDate: null,
  recordStatus: null,
  firstRecordedAt: null,
  lastChangedAt: null,
}

const emptyReminder: ReminderCoverageDto = {
  covered: false,
  localDate: null,
  scheduledLocalTime: null,
}

function stateCopy(today: TodayDto): { kicker: string; title: string; description: string } {
  switch (today.viewState) {
    case 'before_start':
      return { kicker: '计划尚未开始', title: '今天无需记录', description: `计划从 ${today.nextActiveDate ?? '稍后'} 开始` }
    case 'break':
      return { kicker: `本周期第 ${today.cycleDay ?? '-'} 天`, title: '今天是停药日', description: `下次服药：${today.nextActiveDate ?? '-'}` }
    case 'taken':
      return { kicker: '今日记录', title: '今天已记录', description: '状态：已服' }
    case 'not_taken':
      return { kicker: '今日记录', title: '今天记录为未服', description: '这里只记录事实，不提供医学判断' }
    case 'unrecorded_overdue':
      return { kicker: '已到计划时间', title: '今天尚未记录', description: `计划时间 ${today.scheduledLocalTime}` }
    case 'future':
      return { kicker: `本周期第 ${today.cycleDay ?? '-'} 天`, title: '今天需要服药', description: `计划时间 ${today.scheduledLocalTime}` }
  }
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    today: emptyToday,
    reminder: emptyReminder,
    stateKicker: '',
    stateTitle: '',
    stateDescription: '',
    reminderText: '',
    recordedTimeText: '',
    showRecordActions: false,
    showEditRecord: false,
  },

  onShow() {
    void flushPendingSubscriptions()
    void this.refresh()
  },

  onPullDownRefresh() {
    void this.refresh().finally(() => wx.stopPullDownRefresh())
  },

  async refresh() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const data = await callApi<BootstrapDto>('bootstrap.get')
      if (!data.hasRegimen || !data.today) {
        wx.redirectTo({ url: '/pages/onboarding/index' })
        return
      }
      this.applyViewModel(data.today, data.reminder)
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error instanceof Error ? error.message : '同步失败，请重试',
      })
    }
  },

  applyViewModel(today: TodayDto, reminder: ReminderCoverageDto) {
    const copy = stateCopy(today)
    const showRecordActions = today.viewState === 'future' || today.viewState === 'unrecorded_overdue'
    const showEditRecord = today.viewState === 'taken' || today.viewState === 'not_taken'
    const timestamp = today.lastChangedAt ?? today.firstRecordedAt
    const reminderText = reminder.covered
      ? `${reminder.localDate} ${reminder.scheduledLocalTime}`
      : '下一次微信提醒未开启'

    this.setData({
      loading: false,
      today,
      reminder,
      stateKicker: copy.kicker,
      stateTitle: copy.title,
      stateDescription: copy.description,
      reminderText,
      recordedTimeText: timestamp ? `记录于 ${timestamp}` : '',
      showRecordActions,
      showEditRecord,
    })
  },

  confirmTaken() {
    wx.showModal({
      title: '确认已服？',
      content: '将使用服务器时间保存今天的记录。',
      confirmText: '确认已服',
      success: ({ confirm }) => {
        if (confirm) void this.setTodayStatus('taken', true)
      },
    })
  },

  markNotTaken() {
    wx.showModal({
      title: '记录今天未服？',
      content: '这里只记录事实，不会给出医学建议。',
      confirmText: '确认记录',
      success: ({ confirm }) => {
        if (confirm) void this.setTodayStatus('not_taken', false)
      },
    })
  },

  editRecord() {
    const nextStatus = this.data.today.recordStatus === 'taken' ? 'not_taken' : 'taken'
    wx.showModal({
      title: '修改今天的记录？',
      content: `将状态修改为“${nextStatus === 'taken' ? '已服' : '未服'}”。`,
      confirmText: '确认修改',
      success: ({ confirm }) => {
        if (confirm) void this.setTodayStatus(nextStatus, nextStatus === 'taken')
      },
    })
  },

  async setTodayStatus(status: 'taken' | 'not_taken', requestReminder: boolean) {
    wx.showLoading({ title: '正在保存' })
    const choice = requestReminder ? await requestSelfDueSubscription() : 'unavailable'
    try {
      await callApi('dose.setToday', { status }, createRequestId())
      if (choice === 'accept') await registerAcceptedSubscription('dose_confirm')
      await this.refresh()
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async enableReminder() {
    const choice = await requestSelfDueSubscription()
    if (choice !== 'accept') {
      wx.showToast({ title: '没有开启下一次提醒', icon: 'none' })
      return
    }
    const registered = await registerAcceptedSubscription('manual_enable')
    wx.showToast({ title: registered ? '下一次提醒已开启' : '提醒同步失败', icon: 'none' })
    await this.refresh()
  },

  editPlan() {
    wx.navigateTo({ url: '/pages/onboarding/index?mode=edit' })
  },

  openCalendar() {
    wx.switchTab({ url: '/pages/calendar/index' })
  },
})
