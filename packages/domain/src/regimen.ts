import {
  addCalendarDays,
  compareLocalDates,
  differenceInCalendarDays,
  type LocalDate,
} from './local-date'

export const REGIMEN_KINDS = ['standard_21_7', 'yaz_24_4'] as const
export type RegimenKind = (typeof REGIMEN_KINDS)[number]

export interface RegimenCycle {
  activeDays: number
  placeboDays: number
  breakDays: number
}

export const STANDARD_21_7_CYCLE: RegimenCycle = { activeDays: 21, placeboDays: 0, breakDays: 7 }
export const YAZ_24_4_CYCLE: RegimenCycle = { activeDays: 24, placeboDays: 4, breakDays: 0 }

// Retained for callers and documents that still use the V1 21+7 constants.
export const ACTIVE_DAYS = STANDARD_21_7_CYCLE.activeDays
export const BREAK_DAYS = STANDARD_21_7_CYCLE.breakDays
export const CYCLE_LENGTH = ACTIVE_DAYS + BREAK_DAYS

export type PlanStatus = 'before_start' | 'active' | 'placebo' | 'break'

export interface PlanDay {
  status: PlanStatus
  cycleDay?: number
}

export function isRegimenKind(value: unknown): value is RegimenKind {
  return typeof value === 'string' && REGIMEN_KINDS.includes(value as RegimenKind)
}

export function normalizeRegimenKind(value: unknown): RegimenKind {
  return value === 'yaz_24_4' ? 'yaz_24_4' : 'standard_21_7'
}

export function cycleForRegimenKind(kind: RegimenKind): RegimenCycle {
  return kind === 'yaz_24_4' ? YAZ_24_4_CYCLE : STANDARD_21_7_CYCLE
}

export function cycleLength(cycle: RegimenCycle): number {
  return cycle.activeDays + cycle.placeboDays + cycle.breakDays
}

export function isDoseDay(status: PlanStatus): status is 'active' | 'placebo' {
  return status === 'active' || status === 'placebo'
}

export function getPlanDay(
  startDate: LocalDate,
  targetDate: LocalDate,
  cycle: RegimenCycle = STANDARD_21_7_CYCLE,
): PlanDay {
  const offset = differenceInCalendarDays(targetDate, startDate)
  if (offset < 0) return { status: 'before_start' }

  const length = cycleLength(cycle)
  if (length <= 0) throw new Error('INVALID_REGIMEN_CYCLE')
  const dayIndex = ((offset % length) + length) % length
  const status = dayIndex < cycle.activeDays
    ? 'active'
    : dayIndex < cycle.activeDays + cycle.placeboDays
      ? 'placebo'
      : 'break'
  return {
    status,
    cycleDay: dayIndex + 1,
  }
}

export function nextDoseDate(
  startDate: LocalDate,
  afterDate: LocalDate,
  cycle: RegimenCycle = STANDARD_21_7_CYCLE,
  includeAfterDate = false,
): LocalDate {
  let candidate = includeAfterDate ? afterDate : addCalendarDays(afterDate, 1)

  if (compareLocalDates(candidate, startDate) < 0) candidate = startDate

  for (let attempts = 0; attempts <= cycleLength(cycle); attempts += 1) {
    if (isDoseDay(getPlanDay(startDate, candidate, cycle).status)) return candidate
    candidate = addCalendarDays(candidate, 1)
  }

  throw new Error('DOSE_DATE_NOT_FOUND')
}

export function nextActiveDate(
  startDate: LocalDate,
  afterDate: LocalDate,
  includeAfterDate = false,
): LocalDate {
  return nextDoseDate(startDate, afterDate, STANDARD_21_7_CYCLE, includeAfterDate)
}
