import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLocalDate } from '../src/local-date'
import {
  STANDARD_21_7_CYCLE,
  YAZ_24_4_CYCLE,
  getPlanDay,
  isDoseDay,
  nextActiveDate,
  nextDoseDate,
} from '../src/regimen'

const start = parseLocalDate('2026-09-01')

test('calculates 21+7 boundary days', () => {
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-08-31')), { status: 'before_start' })
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-01')), { status: 'active', cycleDay: 1 })
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-21')), { status: 'active', cycleDay: 21 })
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-22')), { status: 'break', cycleDay: 22 })
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-28')), { status: 'break', cycleDay: 28 })
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-29')), { status: 'active', cycleDay: 1 })
})

test('finds the next active date across the break', () => {
  assert.equal(nextActiveDate(start, parseLocalDate('2026-09-21')), '2026-09-29')
  assert.equal(nextActiveDate(start, parseLocalDate('2026-09-22')), '2026-09-29')
  assert.equal(nextActiveDate(start, parseLocalDate('2026-08-20')), '2026-09-01')
})

test('calculates the Yaz 24 active plus 4 placebo cycle', () => {
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-24'), YAZ_24_4_CYCLE), {
    status: 'active',
    cycleDay: 24,
  })
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-25'), YAZ_24_4_CYCLE), {
    status: 'placebo',
    cycleDay: 25,
  })
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-28'), YAZ_24_4_CYCLE), {
    status: 'placebo',
    cycleDay: 28,
  })
  assert.deepEqual(getPlanDay(start, parseLocalDate('2026-09-29'), YAZ_24_4_CYCLE), {
    status: 'active',
    cycleDay: 1,
  })
  assert.equal(isDoseDay(getPlanDay(start, parseLocalDate('2026-09-28'), YAZ_24_4_CYCLE).status), true)
})

test('Yaz reminders continue through the four placebo tablets', () => {
  assert.equal(nextDoseDate(start, parseLocalDate('2026-09-24'), YAZ_24_4_CYCLE), '2026-09-25')
  assert.equal(nextDoseDate(start, parseLocalDate('2026-09-28'), YAZ_24_4_CYCLE), '2026-09-29')
  assert.equal(nextDoseDate(start, parseLocalDate('2026-09-21'), STANDARD_21_7_CYCLE), '2026-09-29')
})
