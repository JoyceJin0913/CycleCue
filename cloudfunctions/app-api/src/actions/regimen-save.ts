import {
  compareLocalDates,
  cycleForRegimenKind,
  isRegimenKind,
  localDateInTimeZone,
  localDateTimeToUtc,
  parseLocalDate,
} from '../../../../packages/domain/src/index'
import type { AppContext } from '../context'
import { BusinessError, assertString } from '../errors'
import {
  claimIdempotency,
  completeIdempotency,
  effectiveToForPlanCorrection,
  ensureUser,
  getDocument,
  listRegimens,
  stableId,
  withoutDocumentId,
  type RegimenDocument,
} from '../helpers'
import { allocateAvailableGrants } from './subscription'
import { refreshCaregiverRemindersForOwner } from '../care-reminders'

interface SaveRegimenPayload {
  regimenKind?: unknown
  startDate?: unknown
  scheduledLocalTime?: unknown
}

export async function regimenSave(context: AppContext, payload: SaveRegimenPayload) {
  const regimenKind = payload.regimenKind === undefined ? 'standard_21_7' : payload.regimenKind
  if (!isRegimenKind(regimenKind)) throw new BusinessError('INVALID_REGIMEN_KIND', '请选择有效的服药方案')
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
  const currentCandidates = regimens.filter(
    (item) => item.effectiveFrom <= today && (item.effectiveTo === undefined || today < item.effectiveTo),
  )
  const current = [...regimens].reverse().find((item) => item.status === 'active')
    ?? currentCandidates[currentCandidates.length - 1]
  const effectiveFrom = startDate
  const regimenId = current?._id ?? stableId(context.userId, 'regimen', context.requestId)
  const correctedPriorVersions = regimens
    .filter((item) => item._id !== regimenId)
    .map((item) => ({ item, effectiveTo: effectiveToForPlanCorrection(item, effectiveFrom) }))
    .filter((entry): entry is { item: RegimenDocument; effectiveTo: string } => entry.effectiveTo !== null)
  const cycle = cycleForRegimenKind(regimenKind)
  const regimen: RegimenDocument = {
    _id: regimenId,
    ownerUserId: context.userId,
    regimenKind,
    startDate,
    activeDays: cycle.activeDays,
    placeboDays: cycle.placeboDays,
    breakDays: cycle.breakDays,
    scheduledLocalTime: payload.scheduledLocalTime,
    timezone: 'Asia/Shanghai',
    effectiveFrom,
    status: 'active',
    createdAt: current?.createdAt ?? context.serverNow,
  }

  await context.db.runTransaction(async (transaction: any) => {
    for (const prior of correctedPriorVersions) {
      await transaction.collection('regimen_versions').doc(prior.item._id).update({
        data: { effectiveTo: prior.effectiveTo, status: 'superseded' },
      })
    }
    await transaction.collection('regimen_versions').doc(regimenId).set({ data: withoutDocumentId(regimen) })
    await transaction.collection('users').doc(context.userId).update({
      data: { activeRegimenVersionId: regimenId, updatedAt: context.serverNow },
    })
  })

  const replacedRegimenIds = Array.from(new Set([
    current?._id,
    ...correctedPriorVersions.map((entry) => entry.item._id),
  ].filter(Boolean) as string[]))
  if (replacedRegimenIds.length > 0) {
    const newPlanStartsAt = localDateTimeToUtc(effectiveFrom, '00:00')
    for (const replacedRegimenId of replacedRegimenIds) {
      const jobs = await context.db
        .collection('reminder_jobs')
        .where({
          recipientUserId: context.userId,
          regimenVersionId: replacedRegimenId,
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
  }

  const templateId = process.env.SELF_DUE_TEMPLATE_ID
  if (templateId && templateId !== 'configure-in-cloud-console') {
    try {
      await allocateAvailableGrants(context, templateId)
    } catch {
      console.error(JSON.stringify({ event: 'grant.reallocation_after_plan_change_failed', requestId: context.requestId }))
    }
  }

  try {
    await refreshCaregiverRemindersForOwner(context)
  } catch {
    console.error(JSON.stringify({ event: 'care_reminder.refresh_after_plan_change_failed', requestId: context.requestId }))
  }

  await completeIdempotency(context, idempotency.id, regimenId)
  return regimen
}
