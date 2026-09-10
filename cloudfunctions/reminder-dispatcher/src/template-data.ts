interface ReminderTemplateJob {
  localDate: string
  scheduledLocalTime: string
  regimenKind?: string
  planStatus?: string
}

export function buildTemplateData(job: ReminderTemplateJob) {
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
