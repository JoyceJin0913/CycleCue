import { callApi, createRequestId } from '../../services/api-client'
import type { BootstrapDto, PhotoUploadDto, ReminderCoverageDto, TodayDto } from '../../services/api-types'
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
  evidenceType: 'none',
  evidenceFileId: null,
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function photoExtension(path: string): 'jpg' | 'jpeg' | 'png' {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension === 'png' || extension === 'jpeg' ? extension : 'jpg'
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
    pendingPhotoPath: '',
    pendingPhotoSize: 0,
    photoTempUrl: '',
    choosingPhoto: false,
    savingPhoto: false,
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
      pendingPhotoPath: '',
      pendingPhotoSize: 0,
      photoTempUrl: '',
    })
    if (today.evidenceFileId) void this.resolvePhotoUrl(today.evidenceFileId)
  },

  async resolvePhotoUrl(fileId: string) {
    try {
      const result = await wx.cloud.getTempFileURL({ fileList: [fileId] })
      const photo = result.fileList[0]
      if (photo?.tempFileURL) this.setData({ photoTempUrl: photo.tempFileURL })
    } catch {
      this.setData({ photoTempUrl: '' })
    }
  },

  async takePhoto() {
    if (this.data.choosingPhoto || this.data.savingPhoto) return
    this.setData({ choosingPhoto: true })
    try {
      const result = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera'],
        sizeType: ['compressed'],
      })
      const photo = result.tempFiles[0]
      if (!photo) return
      if (photo.size > MAX_PHOTO_BYTES) {
        wx.showToast({ title: '照片不能超过 5 MB', icon: 'none' })
        return
      }
      this.setData({ pendingPhotoPath: photo.tempFilePath, pendingPhotoSize: photo.size })
    } catch {
      // Cancelling the camera is not an error and should not create a record.
    } finally {
      this.setData({ choosingPhoto: false })
    }
  },

  cancelPhoto() {
    if (!this.data.savingPhoto) this.setData({ pendingPhotoPath: '', pendingPhotoSize: 0 })
  },

  previewPhoto() {
    const url = this.data.photoTempUrl || this.data.pendingPhotoPath
    if (url) wx.previewImage({ current: url, urls: [url] })
  },

  async confirmPhotoTaken() {
    const filePath = this.data.pendingPhotoPath
    if (!filePath || this.data.savingPhoto) return
    this.setData({ savingPhoto: true })
    wx.showLoading({ title: '正在保存' })
    const subscriptionChoice = await requestSelfDueSubscription()
    let saved = false
    try {
      const prepared = await callApi<PhotoUploadDto>('photo.prepareUpload', {
        extension: photoExtension(filePath),
        size: this.data.pendingPhotoSize,
      })
      const uploaded = await wx.cloud.uploadFile({ cloudPath: prepared.cloudPath, filePath })
      await callApi(
        'dose.setToday',
        { status: 'taken', evidence: { uploadId: prepared.uploadId, fileId: uploaded.fileID } },
        createRequestId(),
      )
      saved = true
      this.setData({ pendingPhotoPath: '', pendingPhotoSize: 0 })
      await this.refresh()
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '照片保存失败', icon: 'none' })
    } finally {
      if (subscriptionChoice === 'accept') await registerAcceptedSubscription('dose_confirm')
      wx.hideLoading()
      this.setData({ savingPhoto: false })
      if (saved) wx.showToast({ title: '已记录', icon: 'success' })
    }
  },

  confirmTaken() {
    wx.showModal({
      title: '无照片确认？',
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
