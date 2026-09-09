import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveDayViewState } from '../src/day-state'

test('recorded facts take precedence on active days', () => {
  assert.equal(
    deriveDayViewState({ planStatus: 'active', recordStatus: 'taken', plannedAtMs: 100, nowMs: 200 }),
    'taken',
  )
  assert.equal(
    deriveDayViewState({ planStatus: 'active', recordStatus: 'not_taken', plannedAtMs: 100, nowMs: 200 }),
    'not_taken',
  )
})

test('derives future and overdue without medical interpretation', () => {
  assert.equal(
    deriveDayViewState({ planStatus: 'active', recordStatus: null, plannedAtMs: 200, nowMs: 100 }),
    'future',
  )
  assert.equal(
    deriveDayViewState({ planStatus: 'active', recordStatus: null, plannedAtMs: 100, nowMs: 100 }),
    'unrecorded_overdue',
  )
})
