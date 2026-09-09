import type { PlanStatus } from './regimen'

export type RecordStatus = 'taken' | 'not_taken' | null
export type DayViewState =
  | 'before_start'
  | 'break'
  | 'future'
  | 'unrecorded_overdue'
  | 'taken'
  | 'not_taken'

export function deriveDayViewState(input: {
  planStatus: PlanStatus
  recordStatus: RecordStatus
  plannedAtMs: number
  nowMs: number
}): DayViewState {
  if (input.planStatus === 'before_start') return 'before_start'
  if (input.planStatus === 'break') return 'break'
  if (input.recordStatus === 'taken') return 'taken'
  if (input.recordStatus === 'not_taken') return 'not_taken'
  return input.nowMs < input.plannedAtMs ? 'future' : 'unrecorded_overdue'
}
