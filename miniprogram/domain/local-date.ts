export type LocalDate = string & { readonly __brand: 'LocalDate' }

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

export function parseLocalDate(value: string): LocalDate {
  const match = LOCAL_DATE_PATTERN.exec(value)
  if (!match) throw new Error('INVALID_LOCAL_DATE')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utcMs = Date.UTC(year, month - 1, day)
  const check = new Date(utcMs)

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error('INVALID_LOCAL_DATE')
  }

  return value as LocalDate
}

export function civilDayOrdinal(value: LocalDate): number {
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(Date.UTC(year!, month! - 1, day!) / DAY_MS)
}

export function fromCivilDayOrdinal(ordinal: number): LocalDate {
  const date = new Date(ordinal * DAY_MS)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as LocalDate
}

export function addCalendarDays(value: LocalDate, days: number): LocalDate {
  return fromCivilDayOrdinal(civilDayOrdinal(value) + days)
}

export function differenceInCalendarDays(later: LocalDate, earlier: LocalDate): number {
  return civilDayOrdinal(later) - civilDayOrdinal(earlier)
}

export function compareLocalDates(left: LocalDate, right: LocalDate): number {
  return civilDayOrdinal(left) - civilDayOrdinal(right)
}

export function localDateInTimeZone(now: Date, timeZone = 'Asia/Shanghai'): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const values = new Map(parts.map((part) => [part.type, part.value]))
  return parseLocalDate(`${values.get('year')}-${values.get('month')}-${values.get('day')}`)
}

export function localDateTimeToUtc(
  date: LocalDate,
  time: string,
  timeZone: 'Asia/Shanghai' = 'Asia/Shanghai',
): Date {
  if (timeZone !== 'Asia/Shanghai') throw new Error('UNSUPPORTED_TIMEZONE')
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) throw new Error('INVALID_LOCAL_TIME')

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new Error('INVALID_LOCAL_TIME')

  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!, hour - 8, minute))
}
