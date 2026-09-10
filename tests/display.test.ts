import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatChinaTimestamp,
  formatFullLocalDate,
  formatShortLocalDate,
} from '../miniprogram/utils/display'

test('formats local dates for compact UI copy', () => {
  assert.equal(formatFullLocalDate('2026-09-09'), '2026年9月9日')
  assert.equal(formatShortLocalDate('2026-09-12', '2026-09-09'), '9月12日')
  assert.equal(formatShortLocalDate('2027-01-01', '2026-09-09'), '2027年1月1日')
})

test('formats server timestamps in China time', () => {
  assert.equal(formatChinaTimestamp('2026-09-09T15:31:03.446Z', '2026-09-09'), '9月9日 23:31')
  assert.equal(formatChinaTimestamp('2026-12-31T16:01:00.000Z', '2026-12-31'), '2027年1月1日 00:01')
})

test('preserves invalid display values without throwing', () => {
  assert.equal(formatFullLocalDate('unknown'), 'unknown')
  assert.equal(formatChinaTimestamp('unknown'), 'unknown')
})
