import { addCalendarDays, compareLocalDates, localDateInTimeZone, localDateTimeToUtc, parseLocalDate } from '../../../../packages/domain/src/index'
import type { AppContext } from '../context'
import { BusinessError, assertString } from '../errors'
import {
  claimIdempotency,
  completeIdempotency,
  ensureUser,
  getDocument,
  listRegimens,
  stableId,
  type RegimenDocument,
} from '../helpers'

interface SaveRegimenPayload {
  startDate?: unknown
  scheduledLocalTime?: unknown
}

export async function regimenSave(context: AppContext, payload: SaveRegimenPayload) {
  assertString(payload.startDate, 'INVALID_DATE', '请选择有效的药板开始日期')
  assertString(payload.scheduledLocalTime, 'INVALID_TIME', '请选择有效的提醒时间')
  const startDate = parseLocalDate(payload.startDate)
  localDateTimeToUtc(startDate, payload.scheduledLocalTime)
  const today = localDateInTimeZone(context.serverNow)
  if (compareLocalDates(startDate, today) > 0) {
    throw new BusinessError('INVALID_DATE', '药板第一天不能晚于今天')
  }

  await ensureUser(context)
  const idempotency = await claimIdempotency(context, 'regimen.save', payload)
  if (idempotency.completedResultRef) {
    const existing = await getDocument<RegimenDocument>(
      context.db.collection('regimen_versions'),
      idempotency.completedResultRef,
    )
    if (existing) return existing
  }

  const regimens = await listRegimens(context)
  const latest = regimens[regimens.length - 1]
  const effectiveFrom = latest ? addCalendarDays(today, 1) : startDate
  const regimenId = stableId(context.userId, 'regimen', context.requestId)
  const regimen: RegimenDocument = {
    _id: regimenId,
    ownerUserId: context.userId,
    startDate,
    activeDays: 21,
    breakDays: 7,
    scheduledLocalTime: payload.scheduledLocalTime,
    timezone: 'Asia/Shanghai',
    effectiveFrom,
    status: 'active',
    createdAt: context.serverNow,
  }

  if (latest && latest.effectiveFrom === effectiveFrom) {
    throw new BusinessError('PLAN_CHANGE_ALREADY_SCHEDULED', '次日已有待生效的计划，请刷新后再修改')
  }

  await context.db.runTransaction(async (transaction: any) => {
    if (latest) {
      await transaction.collection('regimen_versions').doc(latest._id).update({
        data: { effectiveTo: effectiveFrom, status: 'superseded' },
      })
    }
    await transaction.collection('regimen_versions').doc(regimenId).set({ data: regimen })
    await transaction.collection('users').doc(context.userId).update({
      data: { activeRegimenVersionId: regimenId, updatedAt: context.serverNow },
    })
  })

  if (latest) {
    const newPlanStartsAt = localDateTimeToUtc(effectiveFrom, '00:00')
    const jobs = await context.db
      .collection('reminder_jobs')
      .where({
        recipientUserId: context.userId,
        regimenVersionId: latest._id,
        status: 'pending',
        scheduledAt: context.command.gte(newPlanStartsAt),
      })
      .get()
    for (const job of jobs.data) {
      await context.db.runTransaction(async (transaction: any) => {
        await transaction.collection('reminder_jobs').doc(job._id).update({
          data: { status: 'skipped_plan_changed', updatedAt: context.serverNow },
        })
        if (job.grantId) {
          await transaction.collection('subscription_grants').doc(job.grantId).update({
            data: { status: 'available', reservedJobId: context.command.remove(), updatedAt: context.serverNow },
          })
        }
      })
    }
  }

  await completeIdempotency(context, idempotency.id, regimenId)
  return regimen
}
