import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLocalDate } from '../src/local-date'
import { getPlanDay, nextActiveDate } from '../src/regimen'

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
