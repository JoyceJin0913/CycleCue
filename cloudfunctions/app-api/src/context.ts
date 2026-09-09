import { createHmac } from 'node:crypto'
import { BusinessError } from './errors'

export interface AppContext {
  db: any
  command: any
  userId: string
  openid: string
  appid: string
  requestId: string
  serverNow: Date
}

export function createAppContext(cloud: any, requestId: string): AppContext {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID as string | undefined
  const appid = wxContext.APPID as string | undefined
  const secret = process.env.USER_ID_HASH_SECRET

  if (!openid || !appid) throw new BusinessError('IDENTITY_MISSING', '无法读取小程序身份')
  if (!secret || secret === 'configure-in-cloud-console') {
    throw new BusinessError('SERVER_NOT_CONFIGURED', '服务端身份密钥尚未配置')
  }

  const userId = createHmac('sha256', secret).update(`${appid}:${openid}`).digest('hex')
  const db = cloud.database({ env: cloud.DYNAMIC_CURRENT_ENV })

  return {
    db,
    command: db.command,
    userId,
    openid,
    appid,
    requestId,
    serverNow: new Date(),
  }
}
