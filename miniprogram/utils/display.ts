const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000

function localDateParts(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null
  const match = LOCAL_DATE_PATTERN.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function formatFullLocalDate(value: string | null | undefined): string {
  const parts = localDateParts(value)
  return parts ? `${parts.year}年${parts.month}月${parts.day}日` : value || '-'
}

export function formatShortLocalDate(
  value: string | null | undefined,
  referenceLocalDate?: string,
): string {
  const parts = localDateParts(value)
  if (!parts) return value || '-'
  const reference = localDateParts(referenceLocalDate)
  return reference?.year === parts.year
    ? `${parts.month}月${parts.day}日`
    : `${parts.year}年${parts.month}月${parts.day}日`
}

export function formatChinaTimestamp(value: string | null | undefined, referenceLocalDate?: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const china = new Date(parsed.getTime() + CHINA_OFFSET_MS)
  const localDate = `${china.getUTCFullYear()}-${String(china.getUTCMonth() + 1).padStart(2, '0')}-${String(
    china.getUTCDate(),
  ).padStart(2, '0')}`
  const time = `${String(china.getUTCHours()).padStart(2, '0')}:${String(china.getUTCMinutes()).padStart(2, '0')}`
  return `${formatShortLocalDate(localDate, referenceLocalDate)} ${time}`
}
