import { runtimeConfig } from './config/runtime'

App({
  onLaunch() {
    if (!wx.cloud || !runtimeConfig.cloudEnvId) return
    wx.cloud.init({
      env: runtimeConfig.cloudEnvId,
      traceUser: false,
    })
  },
})
