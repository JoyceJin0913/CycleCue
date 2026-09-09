import { callApi } from '../../services/api-client'
import type { BootstrapDto } from '../../services/api-types'
import { flushPendingSubscriptions } from '../../services/subscription'

Page({
  data: {
    message: '正在读取今天的计划…',
    canRetry: false,
  },

  onLoad() {
    void this.bootstrap()
  },

  retry() {
    void this.bootstrap()
  },

  async bootstrap() {
    this.setData({ message: '正在读取今天的计划…', canRetry: false })
    try {
      await flushPendingSubscriptions()
      const data = await callApi<BootstrapDto>('bootstrap.get')
      if (data.hasRegimen) {
        wx.switchTab({ url: '/pages/today/index' })
      } else {
        wx.redirectTo({ url: '/pages/onboarding/index' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '暂时无法启动，请稍后重试'
      this.setData({ message, canRetry: true })
    }
  },
})
