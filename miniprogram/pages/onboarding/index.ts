import { localDateInTimeZone, parseLocalDate } from '../../domain/local-date'
import { callApi, createRequestId } from '../../services/api-client'
import type { BootstrapDto } from '../../services/api-types'
import {
  registerAcceptedSubscription,
  requestSelfDueSubscription,
} from '../../services/subscription'

Page({
  data: {
    today: localDateInTimeZone(new Date()),
    startDate: localDateInTimeZone(new Date()),
    scheduledLocalTime: '22:30',
    saving: false,
    errorMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.mode === 'edit') void this.loadExistingPlan()
  },

  async loadExistingPlan() {
    try {
      const data = await callApi<BootstrapDto>('bootstrap.get')
      if (!data.regimen) return
      this.setData({
        startDate: parseLocalDate(data.regimen.startDate),
        scheduledLocalTime: data.regimen.scheduledLocalTime,
      })
    } catch (error) {
      this.setData({ errorMessage: error instanceof Error ? error.message : '读取计划失败' })
    }
  },

  onDateChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ startDate: parseLocalDate(String(event.detail.value)) })
  },

  onTimeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ scheduledLocalTime: String(event.detail.value) })
  },

  async save() {
    if (this.data.saving) return
    this.setData({ saving: true, errorMessage: '' })

    const subscriptionChoice = await requestSelfDueSubscription()
    const requestId = createRequestId()

    try {
      await callApi(
        'regimen.save',
        {
          startDate: this.data.startDate,
          scheduledLocalTime: this.data.scheduledLocalTime,
        },
        requestId,
      )

      if (subscriptionChoice === 'accept') {
        await registerAcceptedSubscription('onboarding')
      }

      wx.switchTab({ url: '/pages/today/index' })
    } catch (error) {
      this.setData({
        errorMessage: error instanceof Error ? error.message : '保存失败，请重试',
        saving: false,
      })
    }
  },
})
