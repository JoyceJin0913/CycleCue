export const CARE_OVERDUE_DELAY_MS = 30 * 60 * 1000

export type CareReminderState = 'skip' | 'notify_not_taken' | 'notify_unrecorded'

export function careReminderAt(plannedAt: Date): Date {
  return new Date(plannedAt.getTime() + CARE_OVERDUE_DELAY_MS)
}

export function careReminderState(recordStatus: 'taken' | 'not_taken' | null): CareReminderState {
  if (recordStatus === 'taken') return 'skip'
  return recordStatus === 'not_taken' ? 'notify_not_taken' : 'notify_unrecorded'
}
