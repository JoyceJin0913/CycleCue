import * as cloud from 'wx-server-sdk'
import { createAppContext } from './context'
import { BusinessError } from './errors'
import { routeAction } from './router'

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

interface EventEnvelope {
  action?: unknown
  requestId?: unknown
  payload?: unknown
}

export async function main(event: EventEnvelope) {
  const serverNow = new Date()
  const requestId = typeof event.requestId === 'string' ? event.requestId : 'missing-request-id'

  try {
    if (typeof event.action !== 'string') throw new BusinessError('INVALID_ACTION', '请求操作无效')
    if (typeof event.requestId !== 'string' || event.requestId.length < 8 || event.requestId.length > 128) {
      throw new BusinessError('INVALID_REQUEST_ID', '请求标识无效')
    }

    const context = createAppContext(cloud, event.requestId)
    const data = await routeAction(context, event.action, event.payload)
    return { ok: true, requestId, serverNow: context.serverNow.toISOString(), data }
  } catch (error) {
    const businessError = error instanceof BusinessError ? error : null
    console.error(
      JSON.stringify({
        event: 'app_api.failed',
        action: typeof event.action === 'string' ? event.action : 'invalid',
        requestId,
        code: businessError?.code ?? 'INTERNAL_ERROR',
      }),
    )
    return {
      ok: false,
      requestId,
      serverNow: serverNow.toISOString(),
      error: {
        code: businessError?.code ?? 'INTERNAL_ERROR',
        message: businessError?.message ?? '服务暂时不可用，请稍后重试',
        retryable: businessError?.retryable ?? true,
      },
    }
  }
}
