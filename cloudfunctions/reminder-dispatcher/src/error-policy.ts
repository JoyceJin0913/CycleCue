export type SendFailurePolicy = 'invalidate' | 'retry' | 'terminal' | 'unknown'

export function classifySendFailure(error: unknown): SendFailurePolicy {
  const code = Number((error as { errCode?: unknown })?.errCode)
  if (code === 43101) return 'invalidate'
  if (code === 43108) return 'retry'
  if (code === 43107 || code === 45168 || code === 47003) return 'terminal'
  return 'unknown'
}
