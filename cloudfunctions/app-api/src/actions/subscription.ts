import {
  addCalendarDays,
  getPlanDay,
  isDoseDay,
  localDateInTimeZone,
  localDateTimeToUtc,
  parseLocalDate,
} from '../../../../packages/domain/src/index'
import type { AppContext } from '../context'
import { BusinessError } from '../errors'
import {
  getDocument,
  listRegimens,
  regimenCycleOf,
  regimenForDate,
  regimenKindOf,
  stableId,
  withoutDocumentId,
} from '../helpers'
import { occurrenceId, reminderCoverage } from '../view'
import { CARE_OVERDUE_TEMPLATE_KEY, registerCareOverdueSubscription } from '../care-reminders'

interface RegisterPayload {
  templateKey?: unknown
  source?: unknown
  relationshipId?: unknown
}

const allowedSources = new Set(['onboarding', 'dose_confirm', 'manual_enable'])

export async function subscriptionRegister(context: AppContext, payload: RegisterPayload) {
  if (payload.templateKey === CARE_OVERDUE_TEMPLATE_KEY) {
    return registerCareOverdueSubscription(context, payload.relationshipId, payload.source)
  }
  if (payload.templateKey !== 'SELF_DUE' || typeof payload.source !== 'string' || !allowedSources.has(payload.source)) {
    throw new BusinessError('INVALID_SUBSCRIPTION', '提醒授权信息无效')
  }
  const templateId = process.env.SELF_DUE_TEMPLATE_ID
  if (!templateId || templateId === 'configure-in-cloud-console') {
    throw new BusinessError('TEMPLATE_NOT_CONFIGURED', '微信提醒模板尚未配置')
  }

  const grantId = stableId(context.userId, 'grant', context.requestId)
  const grants = context.db.collection('subscription_grants')
  const existing = await getDocument<any>(grants, grantId)

  if (!existing) {
    const unconsumed = await grants
      .where({
        recipientUserId: context.userId,
        templateKey: 'SELF_DUE',
        status: context.command.in(['available', 'reserved']),
      })
      .count()
    if (unconsumed.total >= 2) {
      await allocateAvailableGrants(context, templateId)
      return reminderCoverage(context)
    }

    try {
      await grants.add({
        data: {
          _id: grantId,
          recipientUserId: context.userId,
          templateKey: 'SELF_DUE',
          templateId,
          status: 'available',
          source: payload.source,
          requestId: context.requestId,
          acceptedAt: context.serverNow,
          updatedAt: context.serverNow,
        },
      })
    } catch {
      if (!(await getDocument(grants, grantId))) {
        throw new BusinessError('GRANT_REGISTER_FAILED', '提醒授权登记失败', true)
      }
    }
  }

  await allocateAvailableGrants(context, templateId)
  return reminderCoverage(context)
}

export async function allocateAvailableGrants(context: AppContext, templateId: string): Promise<void> {
  const availableResult = await context.db
    .collection('subscription_grants')
    .where({ recipientUserId: context.userId, templateKey: 'SELF_DUE', status: 'available' })
    .orderBy('acceptedAt', 'asc')
    .limit(2)
    .get()
  const regimens = await listRegimens(context)
  const today = localDateInTimeZone(context.serverNow)
  let cursor = today

  for (const grant of availableResult.data) {
    let candidate: {
      localDate: string
      regimenId: string
      occurrence: string
      jobId: string
      scheduledAt: Date
      scheduledLocalTime: string
      regimenKind: string
      planStatus: 'active' | 'placebo'
      replacesExistingJob: boolean
    } | null = null

    for (let count = 0; count < 370; count += 1, cursor = addCalendarDays(cursor, 1)) {
      const regimen = regimenForDate(regimens, cursor)
      if (!regimen) continue
      const planStatus = getPlanDay(parseLocalDate(regimen.startDate), cursor, regimenCycleOf(regimen)).status
      if (!isDoseDay(planStatus)) continue
      const scheduledAt = localDateTimeToUtc(cursor, regimen.scheduledLocalTime)
      if (scheduledAt.getTime() <= context.serverNow.getTime()) continue
      const recorded = await context.db
        .collection('dose_records')
        .where({ ownerUserId: context.userId, localDate: cursor })
        .limit(1)
        .get()
      if (recorded.data.length > 0) continue
      const occurrence = occurrenceId(regimen._id, cursor)
      const jobId = stableId(context.userId, templateId, occurrence, 'self_due')
      const job = await getDocument<any>(context.db.collection('reminder_jobs'), jobId)
      if (job && ['pending', 'dispatching', 'sent'].includes(job.status)) continue
      candidate = {
        localDate: cursor,
        regimenId: regimen._id,
        occurrence,
        jobId,
        scheduledAt,
        scheduledLocalTime: regimen.scheduledLocalTime,
        regimenKind: regimenKindOf(regimen),
        planStatus,
        replacesExistingJob: Boolean(job),
      }
      cursor = addCalendarDays(cursor, 1)
      break
    }

    if (!candidate) return
    await context.db.runTransaction(async (transaction: any) => {
      const currentGrant = await transaction.collection('subscription_grants').doc(grant._id).get()
      if (currentGrant.data?.status !== 'available') return
      await transaction.collection('subscription_grants').doc(grant._id).update({
        data: { status: 'reserved', reservedJobId: candidate!.jobId, updatedAt: context.serverNow },
      })
      const jobData = withoutDocumentId({
          _id: candidate!.jobId,
          recipientUserId: context.userId,
          regimenVersionId: candidate!.regimenId,
          occurrenceId: candidate!.occurrence,
          localDate: candidate!.localDate,
          scheduledLocalTime: candidate!.scheduledLocalTime,
          regimenKind: candidate!.regimenKind,
          planStatus: candidate!.planStatus,
          scheduledAt: candidate!.scheduledAt,
          templateKey: 'SELF_DUE',
          templateId,
          grantId: grant._id,
          status: 'pending',
          attemptCount: 0,
          createdAt: context.serverNow,
          updatedAt: context.serverNow,
        })
      if (candidate!.replacesExistingJob) {
        await transaction.collection('reminder_jobs').doc(candidate!.jobId).update({ data: jobData })
      } else {
        await transaction.collection('reminder_jobs').doc(candidate!.jobId).set({ data: jobData })
      }
    })
  }
}

export async function subscriptionGetStatus(context: AppContext) {
  return reminderCoverage(context)
}
