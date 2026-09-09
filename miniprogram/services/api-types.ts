export type RecordStatus = 'taken' | 'not_taken' | null
export type TodayViewState =
  | 'before_start'
  | 'break'
  | 'future'
  | 'unrecorded_overdue'
  | 'taken'
  | 'not_taken'

export interface RegimenDto {
  id: string
  startDate: string
  scheduledLocalTime: string
  cycleDay: number | null
}

export interface TodayDto {
  localDate: string
  displayDate: string
  planStatus: 'before_start' | 'active' | 'break'
  viewState: TodayViewState
  cycleDay: number | null
  scheduledLocalTime: string
  nextActiveDate: string | null
  recordStatus: RecordStatus
  firstRecordedAt: string | null
  lastChangedAt: string | null
}

export interface ReminderCoverageDto {
  covered: boolean
  localDate: string | null
  scheduledLocalTime: string | null
}

export interface BootstrapDto {
  hasRegimen: boolean
  regimen: RegimenDto | null
  today: TodayDto | null
  reminder: ReminderCoverageDto
}

export interface CalendarCellDto {
  localDate: string
  dayOfMonth: number
  inCurrentMonth: boolean
  state: TodayViewState
}

export interface MonthDto {
  yearMonth: string
  cells: CalendarCellDto[]
}

export type ApiResponse<T> =
  | { ok: true; requestId: string; serverNow: string; data: T }
  | {
      ok: false
      requestId: string
      serverNow: string
      error: { code: string; message: string; retryable: boolean }
    }
