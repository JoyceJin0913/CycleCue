import assert from 'node:assert/strict'
import test from 'node:test'
import {
  effectiveToForPlanCorrection,
  regimenForDate,
  type RegimenDocument,
} from '../cloudfunctions/app-api/src/helpers'

function regimen(
  id: string,
  effectiveFrom: string,
  effectiveTo?: string,
): RegimenDocument {
  return {
    _id: id,
    ownerUserId: 'owner',
    regimenKind: 'standard_21_7',
    startDate: '2026-08-15',
    activeDays: 21,
    placeboDays: 0,
    breakDays: 7,
    scheduledLocalTime: '21:00',
    timezone: 'Asia/Shanghai',
    effectiveFrom,
    effectiveTo,
    status: id === 'corrected' ? 'active' : 'superseded',
    createdAt: new Date('2026-09-12T00:00:00.000Z'),
  }
}

test('a current-pack correction closes every overlapping mistaken version', () => {
  assert.equal(effectiveToForPlanCorrection(regimen('old-1', '2026-09-09', '2026-09-10'), '2026-08-15'), '2026-09-09')
  assert.equal(effectiveToForPlanCorrection(regimen('old-2', '2026-08-01'), '2026-08-15'), '2026-08-15')
  assert.equal(effectiveToForPlanCorrection(regimen('history', '2026-07-01', '2026-08-01'), '2026-08-15'), null)
})

test('the corrected current pack owns September 11 instead of later mistaken edits', () => {
  const versions = [
    regimen('corrected', '2026-08-15'),
    regimen('mistake-1', '2026-09-09', '2026-09-09'),
    regimen('mistake-2', '2026-09-10', '2026-09-10'),
  ]

  assert.equal(regimenForDate(versions, '2026-09-11')?._id, 'corrected')
})
