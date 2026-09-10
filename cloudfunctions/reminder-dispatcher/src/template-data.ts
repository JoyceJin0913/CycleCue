interface ReminderTemplateJob {
  localDate: string
  scheduledLocalTime: string
  reminderLocalDate?: string
  templateKey?: string
  regimenKind?: string
  planStatus?: string
  careState?: 'notify_not_taken' | 'notify_unrecorded'
}

export function buildTemplateData(job: ReminderTemplateJob) {
  if (job.templateKey === 'CAREGIVER_OVERDUE') {
    return {
      thing1: { value: '好友每日记录' },
      time15: { value: `${job.reminderLocalDate ?? job.localDate} ${job.scheduledLocalTime}` },
      thing5: {
        value: job.careState === 'notify_not_taken'
          ? '对方已记录为未服，请联系确认'
          : '对方尚未完成记录，请联系确认',
      },
    }
  }

  const isYaz = job.regimenKind === 'yaz_24_4'
  const medicine = isYaz
    ? job.planStatus === 'placebo' ? '优思悦白色片' : '优思悦浅粉色片'
    : '每日服药'
  const note = isYaz && job.planStatus === 'placebo'
    ? '请按药板顺序服用白色片并完成记录'
    : '请进入小程序完成今日记录'

  return {
    thing1: { value: medicine },
    time15: { value: `${job.localDate} ${job.scheduledLocalTime}` },
    thing5: { value: note },
  }
}
