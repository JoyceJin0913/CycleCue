import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTemplateData } from '../cloudfunctions/reminder-dispatcher/src/template-data'

test('uses generic copy for the legacy 21+7 regimen', () => {
  assert.deepEqual(buildTemplateData({
    localDate: '2026-09-10',
    scheduledLocalTime: '22:30',
    regimenKind: 'standard_21_7',
    planStatus: 'active',
  }), {
    thing1: { value: '每日服药' },
    time15: { value: '2026-09-10 22:30' },
    thing5: { value: '请进入小程序完成今日记录' },
  })
})

test('identifies the active and placebo tablets in a Yaz 24+4 pack', () => {
  const active = buildTemplateData({
    localDate: '2026-09-24',
    scheduledLocalTime: '22:30',
    regimenKind: 'yaz_24_4',
    planStatus: 'active',
  })
  const placebo = buildTemplateData({
    localDate: '2026-09-25',
    scheduledLocalTime: '22:30',
    regimenKind: 'yaz_24_4',
    planStatus: 'placebo',
  })

  assert.equal(active.thing1.value, '优思悦浅粉色片')
  assert.equal(placebo.thing1.value, '优思悦白色片')
  assert.equal(placebo.thing5.value, '请按药板顺序服用白色片并完成记录')
})

test('caregiver reminders reveal neither the medicine nor photo details', () => {
  const unrecorded = buildTemplateData({
    localDate: '2026-09-11',
    reminderLocalDate: '2026-09-11',
    scheduledLocalTime: '23:00',
    templateKey: 'CAREGIVER_OVERDUE',
    regimenKind: 'yaz_24_4',
    careState: 'notify_unrecorded',
    subjectLabel: 'Joyce',
  })
  const notTaken = buildTemplateData({
    localDate: '2026-09-11',
    scheduledLocalTime: '23:00',
    templateKey: 'CAREGIVER_OVERDUE',
    careState: 'notify_not_taken',
    subjectLabel: 'Joyce',
  })

  assert.deepEqual(unrecorded, {
    thing1: { value: '每日用药' },
    time15: { value: '2026-09-11 23:00' },
    thing5: { value: 'Joyce仍未完成记录，请提醒' },
  })
  assert.equal(notTaken.thing5.value, 'Joyce已记录今日未服，请联系')
  assert.equal(JSON.stringify(unrecorded).includes('优思悦'), false)
  assert.equal(JSON.stringify(unrecorded).includes('照片'), false)
})

test('caregiver reminder labels stay inside the thing field limit', () => {
  const result = buildTemplateData({
    localDate: '2026-09-11',
    scheduledLocalTime: '23:00',
    templateKey: 'CAREGIVER_OVERDUE',
    careState: 'notify_unrecorded',
    subjectLabel: '这是一个非常非常长的微信昵称',
  })

  assert.equal(Array.from(result.thing5.value).length <= 20, true)
  assert.equal(result.thing5.value, '这是一个非常非常仍未完成记录，请提醒')
})
