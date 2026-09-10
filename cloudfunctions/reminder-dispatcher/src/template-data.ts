interface ReminderTemplateJob {
  localDate: string
  scheduledLocalTime: string
  reminderLocalDate?: string
  templateKey?: string
  regimenKind?: string
  planStatus?: string
  careState?: 'notify_not_taken' | 'notify_unrecorded'
  subjectLabel?: string
}

export function buildTemplateData(job: ReminderTemplateJob) {
  if (job.templateKey === 'CAREGIVER_OVERDUE') {
    const subjectLabel = displayLabel(job.subjectLabel)
    return {
      thing1: { value: '每日用药' },
      time15: { value: `${job.reminderLocalDate ?? job.localDate} ${job.scheduledLocalTime}` },
      thing5: {
        value: job.careState === 'notify_not_taken'
          ? `${subjectLabel}已记录今日未服，请联系`
          : `${subjectLabel}仍未完成记录，请提醒`,
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

function displayLabel(value: string | undefined): string {
  const normalized = value?.trim().replace(/[\u0000-\u001f\u007f]/g, '') || '你的朋友'
  return Array.from(normalized).slice(0, 8).join('')
}
