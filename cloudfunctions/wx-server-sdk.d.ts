declare module 'wx-server-sdk' {
  export const DYNAMIC_CURRENT_ENV: string
  export function init(options: { env: string }): void
  export function database(options?: { env?: string }): unknown
  export const openapi: unknown
  export function getWXContext(): { OPENID?: string }
}
