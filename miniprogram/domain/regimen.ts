import {
  addCalendarDays,
  compareLocalDates,
  differenceInCalendarDays,
  type LocalDate,
} from './local-date'

export const ACTIVE_DAYS = 21
export const BREAK_DAYS = 7
export const CYCLE_LENGTH = ACTIVE_DAYS + BREAK_DAYS

export type PlanStatus = 'before_start' | 'active' | 'break'

export interface PlanDay {
  status: PlanStatus
  cycleDay?: number
}

export function getPlanDay(startDate: LocalDate, targetDate: LocalDate): PlanDay {
  const offset = differenceInCalendarDays(targetDate, startDate)
  if (offset < 0) return { status: 'before_start' }

  const dayIndex = ((offset % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH
  return {
    status: dayIndex < ACTIVE_DAYS ? 'active' : 'break',
    cycleDay: dayIndex + 1,
  }
}

export function nextActiveDate(
  startDate: LocalDate,
  afterDate: LocalDate,
  includeAfterDate = false,
): LocalDate {
  let candidate = includeAfterDate ? afterDate : addCalendarDays(afterDate, 1)

  if (compareLocalDates(candidate, startDate) < 0) candidate = startDate

  for (let attempts = 0; attempts <= CYCLE_LENGTH; attempts += 1) {
    if (getPlanDay(startDate, candidate).status === 'active') return candidate
    candidate = addCalendarDays(candidate, 1)
  }

  throw new Error('ACTIVE_DATE_NOT_FOUND')
}
