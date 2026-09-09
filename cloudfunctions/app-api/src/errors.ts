export class BusinessError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
  }
}

export function assertString(value: unknown, code: string, message: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new BusinessError(code, message)
}
