import { runtimeConfig } from '../config/runtime'
import type { ApiResponse } from './api-types'

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super(message)
  }
}

export function createRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export async function callApi<T>(action: string, payload: unknown = {}, requestId = createRequestId()): Promise<T> {
  if (!runtimeConfig.cloudEnvId || !wx.cloud) {
    throw new ApiError('CLOUD_NOT_CONFIGURED', '请先配置 CloudBase 开发环境', false, requestId)
  }

  const response = await wx.cloud.callFunction({
    name: 'app-api',
    data: { action, requestId, payload },
  })
  const result = response.result as ApiResponse<T>

  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new ApiError('INVALID_API_RESPONSE', '服务返回格式错误', true, requestId)
  }
  if (!result.ok) {
    throw new ApiError(result.error.code, result.error.message, result.error.retryable, result.requestId)
  }
  return result.data
}
