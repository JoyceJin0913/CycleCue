import {
  addCalendarDays,
  careReminderAt,
  getPlanDay,
  isDoseDay,
  localDateInTimeZone,
  localDateTimeToUtc,
  parseLocalDate,
} from '../../../packages/domain/src/index'
import type { AppContext } from './context'
import { BusinessError } from './errors'
import {
  getDocument,
  listRegimensForUser,
  regimenCycleOf,
  regimenForDate,
  regimenKindOf,
  stableId,
  withoutDocumentId,
} from './helpers'
import { occurrenceId } from './view'

export const CARE_OVERDUE_TEMPLATE_KEY = 'CAREGIVER_OVERDUE'
const MAX_SEARCH_DAYS = 370

export interface CareLinkDocument {
  _id: string
  ownerUserId: string
  caregiverUserId: string
  ownerLabel: string
  caregiverLabel: string
  status: 'active' | 'inactive'
  ownerAllowsOverdue?: boolean
  notifyOnOverdue?: boolean
  createdAt: Date
}

interface CareReminderCandidate {
  regimenVersionId: string
  occurrenceId: string
  localDate: string
  reminderLocalDate: string
  scheduledAt: Date
  scheduledLocalTime: string
  subjectScheduledLocalTime: string
  regimenKind: string
  planStatus: 'active' | 'placebo'
}

export function readRelationshipId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new BusinessError('CARE_LINK_INVALID', '朋友关系无效')
  }
  return value
}

export function ownerAllowsCareReminder(link: CareLinkDocument): boolean {
  return link.ownerAllowsOverdue === true || link.notifyOnOverdue === true
}

export async function careReminderCoverage(
  context: AppContext,
  relationshipId: string,
  recipientUserId: string = context.userId,
) {
  const result = await context.db
    .collection('reminder_jobs')
    .where({
      recipientUserId,
      status: context.command.in(['pending', 'dispatching']),
    })
    .orderBy('scheduledAt', 'asc')
    .limit(50)
    .get()
  const job = result.data.find(
    (item: any) => item.careLinkId === relationshipId && item.templateKey === CARE_OVERDUE_TEMPLATE_KEY,
  )
  return job
    ? {
        covered: true,
        localDate: job.reminderLocalDate ?? job.localDate,
        scheduledLocalTime: job.scheduledLocalTime,
      }
    : { covered: false, localDate: null, scheduledLocalTime: null }
}

export async function registerCareOverdueSubscription(
  context: AppContext,
  relationshipIdValue: unknown,
  source: unknown,
) {
  const relationshipId = readRelationshipId(relationshipIdValue)
  if (source !== 'care_manual') {
    throw new BusinessError('INVALID_SUBSCRIPTION', '朋友提醒授权信息无效')
  }
  const templateId = process.env.CAREGIVER_OVERDUE_TEMPLATE_ID ?? process.env.SELF_DUE_TEMPLATE_ID
  if (!templateId || templateId === 'configure-in-cloud-console') {
    throw new BusinessError('TEMPLATE_NOT_CONFIGURED', '朋友提醒模板尚未配置')
  }

  const link = await getDocument<CareLinkDocument>(context.db.collection('care_links'), relationshipId)
  if (!link || link.status !== 'active' || link.caregiverUserId !== context.userId) {
    throw new BusinessError('CARE_LINK_FORBIDDEN', '你无法为这段朋友关系开启提醒')
  }
  if (!ownerAllowsCareReminder(link)) {
    throw new BusinessError('CARE_REMINDER_NOT_ALLOWED', '对方尚未允许你接收逾期提醒')
  }

  const grants = context.db.collection('subscription_grants')
  const existingCoverage = await careReminderCoverage(context, relationshipId)
  if (existingCoverage.covered) return existingCoverage

  const existingUnconsumed = await grants
    .where({
      recipientUserId: context.userId,
      templateKey: CARE_OVERDUE_TEMPLATE_KEY,
      status: context.command.in(['available', 'reserved']),
    })
    .limit(20)
    .get()
  const reusableGrant = existingUnconsumed.data.find((item: any) => item.careLinkId === relationshipId)
  if (reusableGrant) {
    await scheduleCareGrant(context, link, reusableGrant)
    return careReminderCoverage(context, relationshipId)
  }

  const grantId = stableId(context.userId, relationshipId, 'care-grant', context.requestId)
  const existingGrant = await getDocument<any>(grants, grantId)
  if (!existingGrant) {
    await grants.doc(grantId).set({
      data: {
        recipientUserId: context.userId,
        subjectUserId: link.ownerUserId,
        careLinkId: relationshipId,
        templateKey: CARE_OVERDUE_TEMPLATE_KEY,
        templateId,
        status: 'available',
        source,
        requestId: context.requestId,
        acceptedAt: context.serverNow,
        updatedAt: context.serverNow,
      },
    })
  }

  await scheduleCareGrant(context, link, existingGrant ?? {
    _id: grantId,
    status: 'available',
    templateId,
  })
  return careReminderCoverage(context, relationshipId)
}

export async function cancelCareReminderCoverage(
  context: AppContext,
  relationshipId: string,
  reason: 'cancelled_by_friend' | 'cancelled_by_owner' | 'relationship_ended',
): Promise<void> {
  const link = await getDocument<CareLinkDocument>(context.db.collection('care_links'), relationshipId)
  if (!link) return
  const grants = await context.db
    .collection('subscription_grants')
    .where({
      recipientUserId: link.caregiverUserId,
      templateKey: CARE_OVERDUE_TEMPLATE_KEY,
      status: context.command.in(['available', 'reserved']),
    })
    .get()
  for (const grant of grants.data.filter((item: any) => item.careLinkId === relationshipId)) {
    await context.db.collection('subscription_grants').doc(grant._id).update({
      data: { status: reason, invalidReason: reason, updatedAt: context.serverNow },
    })
  }

  const jobs = await context.db
    .collection('reminder_jobs')
    .where({
      recipientUserId: link.caregiverUserId,
      status: context.command.in(['pending', 'dispatching']),
    })
    .get()
  for (const job of jobs.data.filter(
    (item: any) => item.careLinkId === relationshipId && item.templateKey === CARE_OVERDUE_TEMPLATE_KEY,
  )) {
    await context.db.collection('reminder_jobs').doc(job._id).update({
      data: { status: reason, updatedAt: context.serverNow },
    })
  }
}

export async function refreshCaregiverRemindersForOwner(context: AppContext): Promise<void> {
  const links = await context.db
    .collection('care_links')
    .where({ ownerUserId: context.userId, status: 'active' })
    .get()

  for (const rawLink of links.data) {
    const link = rawLink as CareLinkDocument
    if (!ownerAllowsCareReminder(link)) continue
    const grants = await context.db
      .collection('subscription_grants')
      .where({
        recipientUserId: link.caregiverUserId,
        templateKey: CARE_OVERDUE_TEMPLATE_KEY,
        status: context.command.in(['available', 'reserved']),
      })
      .get()
    for (const grant of grants.data.filter((item: any) => item.careLinkId === link._id)) {
      await scheduleCareGrant(context, link, grant)
    }
  }
}

async function scheduleCareGrant(context: AppContext, link: CareLinkDocument, grant: any): Promise<void> {
  const jobId = stableId(grant._id, 'care-overdue-job')
  const candidate = await findNextCandidate(context, link.ownerUserId)
  const jobs = context.db.collection('reminder_jobs')
  const existingJob = await getDocument<any>(jobs, jobId)

  if (!candidate) {
    if (existingJob && ['pending', 'dispatching'].includes(existingJob.status)) {
      await jobs.doc(jobId).update({ data: { status: 'waiting_for_plan', updatedAt: context.serverNow } })
    }
    await context.db.collection('subscription_grants').doc(grant._id).update({
      data: { status: 'available', reservedJobId: context.command.remove(), updatedAt: context.serverNow },
    })
    return
  }

  const jobData = withoutDocumentId({
    _id: jobId,
    jobKind: 'care_overdue' as const,
    recipientUserId: link.caregiverUserId,
    subjectUserId: link.ownerUserId,
    subjectLabel: link.ownerLabel,
    careLinkId: link._id,
    regimenVersionId: candidate.regimenVersionId,
    occurrenceId: candidate.occurrenceId,
    localDate: candidate.localDate,
    reminderLocalDate: candidate.reminderLocalDate,
    subjectScheduledLocalTime: candidate.subjectScheduledLocalTime,
    scheduledLocalTime: candidate.scheduledLocalTime,
    regimenKind: candidate.regimenKind,
    planStatus: candidate.planStatus,
    scheduledAt: candidate.scheduledAt,
    templateKey: CARE_OVERDUE_TEMPLATE_KEY,
    templateId: grant.templateId,
    grantId: grant._id,
    status: 'pending' as const,
    attemptCount: 0,
    createdAt: existingJob?.createdAt ?? context.serverNow,
    updatedAt: context.serverNow,
  })

  await context.db.runTransaction(async (transaction: any) => {
    const currentLinkResult = await transaction.collection('care_links').doc(link._id).get()
    const currentGrantResult = await transaction.collection('subscription_grants').doc(grant._id).get()
    const currentJobResult = existingJob
      ? await transaction.collection('reminder_jobs').doc(jobId).get()
      : null
    const currentLink = currentLinkResult.data as CareLinkDocument | undefined
    const currentGrant = currentGrantResult.data
    const currentJob = currentJobResult?.data
    if (
      !currentLink ||
      currentLink.status !== 'active' ||
      !ownerAllowsCareReminder(currentLink) ||
      !currentGrant ||
      !['available', 'reserved'].includes(currentGrant.status) ||
      currentJob?.status === 'dispatching'
    ) return

    await transaction.collection('subscription_grants').doc(grant._id).update({
      data: { status: 'reserved', reservedJobId: jobId, updatedAt: context.serverNow },
    })
    if (existingJob) {
      await transaction.collection('reminder_jobs').doc(jobId).update({ data: jobData })
    } else {
      await transaction.collection('reminder_jobs').doc(jobId).set({ data: jobData })
    }
  })
}

async function findNextCandidate(context: AppContext, ownerUserId: string): Promise<CareReminderCandidate | null> {
  const regimens = await listRegimensForUser(context, ownerUserId)
  let cursor = localDateInTimeZone(context.serverNow)

  for (let count = 0; count < MAX_SEARCH_DAYS; count += 1) {
    const regimen = regimenForDate(regimens, cursor)
    if (regimen) {
      const planStatus = getPlanDay(parseLocalDate(regimen.startDate), cursor, regimenCycleOf(regimen)).status
      if (isDoseDay(planStatus)) {
        const scheduledAt = careReminderAt(localDateTimeToUtc(cursor, regimen.scheduledLocalTime))
        if (scheduledAt.getTime() > context.serverNow.getTime()) {
          const record = await context.db
            .collection('dose_records')
            .where({ ownerUserId, localDate: cursor })
            .limit(1)
            .get()
          if (record.data[0]?.status !== 'taken') {
            return {
              regimenVersionId: regimen._id,
              occurrenceId: occurrenceId(regimen._id, cursor),
              localDate: cursor,
              reminderLocalDate: localDateInTimeZone(scheduledAt),
              subjectScheduledLocalTime: regimen.scheduledLocalTime,
              scheduledLocalTime: chinaTime(scheduledAt),
              scheduledAt,
              regimenKind: regimenKindOf(regimen),
              planStatus,
            }
          }
        }
      }
    }
    cursor = addCalendarDays(cursor, 1)
  }
  return null
}

function chinaTime(value: Date): string {
  const shifted = new Date(value.getTime() + 8 * 60 * 60 * 1000)
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
}
