import { localDateInTimeZone, parseLocalDate } from '../../domain/local-date'
import { callApi, createRequestId } from '../../services/api-client'
import type { BootstrapDto } from '../../services/api-types'
import {
  registerAcceptedSubscription,
  requestSelfDueSubscription,
} from '../../services/subscription'
import { formatFullLocalDate } from '../../utils/display'

Page({
  data: {
    today: localDateInTimeZone(new Date()),
    startDate: localDateInTimeZone(new Date()),
    startDateLabel: formatFullLocalDate(localDateInTimeZone(new Date())),
    scheduledLocalTime: '22:30',
    saving: false,
    isEditing: false,
    effectiveHint: '',
    errorMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const isEditing = options.mode === 'edit'
    this.setData({ isEditing })
    if (isEditing) void this.loadExistingPlan()
  },

  async loadExistingPlan() {
    try {
      const data = await callApi<BootstrapDto>('bootstrap.get')
      const editableRegimen = data.pendingRegimen ?? data.regimen
      if (!editableRegimen) return
      this.setData({
        startDate: parseLocalDate(editableRegimen.startDate),
        startDateLabel: formatFullLocalDate(editableRegimen.startDate),
        scheduledLocalTime: editableRegimen.scheduledLocalTime,
        effectiveHint: data.pendingRegimen
          ? '存在一份尚未生效的旧修改，本次保存会替换它并立即生效。'
          : '保存后立即按新计划计算；今天已有的服药记录和照片会保留。',
      })
    } catch (error) {
      this.setData({ errorMessage: error instanceof Error ? error.message : '读取计划失败' })
    }
  },

  onDateChange(event: WechatMiniprogram.PickerChange) {
    const startDate = parseLocalDate(String(event.detail.value))
    this.setData({ startDate, startDateLabel: formatFullLocalDate(startDate) })
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
