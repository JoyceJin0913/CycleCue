import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addCalendarDays,
  differenceInCalendarDays,
  localDateInTimeZone,
  localDateTimeToUtc,
  parseLocalDate,
} from '../src/local-date'

test('validates real Gregorian dates', () => {
  assert.equal(parseLocalDate('2024-02-29'), '2024-02-29')
  assert.throws(() => parseLocalDate('2023-02-29'), /INVALID_LOCAL_DATE/)
  assert.throws(() => parseLocalDate('2026-9-9'), /INVALID_LOCAL_DATE/)
})

test('uses civil-day arithmetic across month, year and leap day', () => {
  assert.equal(differenceInCalendarDays(parseLocalDate('2025-01-01'), parseLocalDate('2024-12-31')), 1)
  assert.equal(addCalendarDays(parseLocalDate('2024-02-28'), 1), '2024-02-29')
  assert.equal(addCalendarDays(parseLocalDate('2024-02-29'), 1), '2024-03-01')
})

test('derives Asia/Shanghai date independent of host timezone', () => {
  assert.equal(localDateInTimeZone(new Date('2026-09-08T16:00:00.000Z')), '2026-09-09')
  assert.equal(localDateInTimeZone(new Date('2026-09-08T15:59:59.999Z')), '2026-09-08')
})

test('converts V1 Shanghai local date and time to UTC', () => {
  assert.equal(
    localDateTimeToUtc(parseLocalDate('2026-09-09'), '22:30').toISOString(),
    '2026-09-09T14:30:00.000Z',
  )
  assert.throws(() => localDateTimeToUtc(parseLocalDate('2026-09-09'), '24:00'))
})
