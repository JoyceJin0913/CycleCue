import {
  addCalendarDays,
  cycleLength,
  deriveDayViewState,
  getPlanDay,
  isDoseDay,
  localDateInTimeZone,
  localDateTimeToUtc,
  parseLocalDate,
  type LocalDate,
} from '../../../packages/domain/src/index'
import type { AppContext } from './context'
import {
  getDocument,
  listRegimensForUser,
  regimenCycleOf,
  regimenForDate,
  regimenKindOf,
  stableId,
  type RegimenDocument,
} from './helpers'

export interface DoseDocument {
  _id: string
  ownerUserId: string
  regimenVersionId: string
  localDate: string
  status: 'taken' | 'not_taken'
  firstRecordedAt: Date
  lastChangedAt: Date
  evidenceType?: 'photo' | 'none'
  evidenceFileId?: string
}

export function occurrenceId(regimenVersionId: string, localDate: string): string {
  return stableId(regimenVersionId, localDate)
}

export async function reminderCoverage(context: AppContext) {
  const result = await context.db
    .collection('reminder_jobs')
    .where({
      recipientUserId: context.userId,
      status: context.command.in(['pending', 'dispatching']),
      scheduledAt: context.command.gt(context.serverNow),
    })
    .orderBy('scheduledAt', 'asc')
    .limit(20)
    .get()
  const job = result.data.find((item: any) => !item.templateKey || item.templateKey === 'SELF_DUE')
  return job
    ? { covered: true, localDate: job.localDate, scheduledLocalTime: job.scheduledLocalTime }
    : { covered: false, localDate: null, scheduledLocalTime: null }
}

function displayDate(localDate: string): string {
  const [, month, day] = localDate.split('-')
  return `${Number(month)} 月 ${Number(day)} 日`
}

export async function todayView(
  context: AppContext,
  regimens?: RegimenDocument[],
  ownerUserId: string = context.userId,
) {
  const today = localDateInTimeZone(context.serverNow)
  const versions = regimens ?? (await listRegimensForUser(context, ownerUserId))
  const regimen = regimenForDate(versions, today) ?? versions.find((item) => item.startDate > today) ?? null
  if (!regimen) return { regimen: null, today: null }

  const regimenCycle = regimenCycleOf(regimen)
  const plan = getPlanDay(parseLocalDate(regimen.startDate), today, regimenCycle)
  const plannedAt = localDateTimeToUtc(today, regimen.scheduledLocalTime)
  const recordResult = await context.db
    .collection('dose_records')
    .where({ ownerUserId, localDate: today })
    .limit(1)
    .get()
  const record = (recordResult.data[0] ?? null) as DoseDocument | null
  let nextDoseDate: LocalDate | null = null
  for (let cursor = addCalendarDays(today, isDoseDay(plan.status) ? 1 : 0), count = 0; count < 35; count += 1) {
    const version = regimenForDate(versions, cursor) ?? regimen
    if (isDoseDay(getPlanDay(parseLocalDate(version.startDate), cursor, regimenCycleOf(version)).status)) {
      nextDoseDate = cursor
      break
    }
    cursor = addCalendarDays(cursor, 1)
  }

  return {
    regimen,
    today: {
      localDate: today,
      displayDate: displayDate(today),
      regimenKind: regimenKindOf(regimen),
      planStatus: plan.status,
      viewState: deriveDayViewState({
        planStatus: plan.status,
        recordStatus: record?.status ?? null,
        plannedAtMs: plannedAt.getTime(),
        nowMs: context.serverNow.getTime(),
      }),
      cycleDay: plan.cycleDay ?? null,
      cycleLength: cycleLength(regimenCycle),
      scheduledLocalTime: regimen.scheduledLocalTime,
      nextActiveDate: nextDoseDate,
      recordStatus: record?.status ?? null,
      firstRecordedAt: record?.firstRecordedAt?.toISOString() ?? null,
      lastChangedAt: record?.lastChangedAt?.toISOString() ?? null,
      evidenceType: record?.evidenceType ?? 'none',
      evidenceFileId: record?.evidenceFileId ?? null,
    },
  }
}
