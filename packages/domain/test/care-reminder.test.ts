import assert from 'node:assert/strict'
import test from 'node:test'
import { careReminderAt, careReminderState } from '../src/index'

test('schedules caregiver checks thirty minutes after the planned time', () => {
  const plannedAt = new Date('2026-09-11T14:30:00.000Z')
  assert.equal(careReminderAt(plannedAt).toISOString(), '2026-09-11T15:00:00.000Z')
})

test('notifies only when the dose is missing or explicitly marked not taken', () => {
  assert.equal(careReminderState('taken'), 'skip')
  assert.equal(careReminderState('not_taken'), 'notify_not_taken')
  assert.equal(careReminderState(null), 'notify_unrecorded')
})
