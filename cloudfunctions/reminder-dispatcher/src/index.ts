import { createHash, randomUUID } from 'node:crypto'
import * as cloud from 'wx-server-sdk'
import {
  addCalendarDays,
  careReminderAt,
  careReminderState,
  compareLocalDates,
  cycleForRegimenKind,
  getPlanDay,
  isDoseDay,
  localDateInTimeZone,
  localDateTimeToUtc,
  normalizeRegimenKind,
  parseLocalDate,
  type CareReminderState,
} from '../../../packages/domain/src/index'
import { classifySendFailure } from './error-policy'
import { buildTemplateData } from './template-data'

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = (cloud as any).database({ env: cloud.DYNAMIC_CURRENT_ENV })
const command = db.command
const LEASE_MS = 90_000
const BATCH_SIZE = 50

export async function main() {
  const now = new Date()
  await quarantineExpiredDispatches(now)

  const due = await db
    .collection('reminder_jobs')
    .where({ status: 'pending', scheduledAt: command.lte(now) })
    .orderBy('scheduledAt', 'asc')
    .limit(BATCH_SIZE)
    .get()

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const candidate of due.data) {
    const job = await claimForAtMostOnce(candidate._id, now)
    if (!job) continue

    try {
      let templateData
      let page = 'pages/today/index?from=reminder'
      if (job.templateKey === 'CAREGIVER_OVERDUE') {
        const state = await caregiverDispatchState(job)
        if (state === 'invalid') {
          await invalidateCareJob(job, now)
          skipped += 1
          continue
        }
        if (state === 'skip') {
          await rescheduleCareJob(job, now)
          skipped += 1
          continue
        }
        templateData = buildTemplateData({ ...job, careState: state })
        page = 'pages/care/index?from=reminder'
      } else {
        if (await doseRecordExists(job.recipientUserId, job.localDate)) {
          await skipAlreadyRecorded(job, now)
          skipped += 1
          continue
        }
        templateData = buildTemplateData(job)
      }

      const user = await getDocument('users', job.recipientUserId)
      if (!user?.openid) throw Object.assign(new Error('RECIPIENT_NOT_FOUND'), { errCode: 43101 })

      await (cloud as any).openapi.subscribeMessage.send({
        touser: user.openid,
        templateId: job.templateId,
        page,
        miniprogramState: process.env.MINIPROGRAM_STATE ?? 'developer',
        lang: 'zh_CN',
        data: templateData,
      })

      await db.runTransaction(async (transaction: any) => {
        await transaction.collection('reminder_jobs').doc(job._id).update({
          data: { status: 'sent', sentAt: now, updatedAt: now },
        })
        await transaction.collection('subscription_grants').doc(job.grantId).update({
          data: { status: 'consumed', consumedAt: now, updatedAt: now },
        })
      })
      sent += 1
    } catch (error) {
      await handleSendFailure(job, error, now)
      failed += 1
    }
  }

  console.log(JSON.stringify({ event: 'reminder.dispatch.completed', sent, skipped, failed }))
  return { sent, skipped, failed }
}

async function caregiverDispatchState(job: any): Promise<CareReminderState | 'invalid'> {
  const [link, grant] = await Promise.all([
    getDocument('care_links', job.careLinkId),
    getDocument('subscription_grants', job.grantId),
  ])
  if (
    !link ||
    link.status !== 'active' ||
    link.ownerAllowsOverdue !== true ||
    link.ownerUserId !== job.subjectUserId ||
    link.caregiverUserId !== job.recipientUserId ||
    !grant ||
    grant.status !== 'reserved' ||
    grant.reservedJobId !== job._id
  ) return 'invalid'

  const record = await doseRecord(job.subjectUserId, job.localDate)
  return careReminderState(record?.status ?? null)
}

async function invalidateCareJob(job: any, now: Date): Promise<void> {
  await db.collection('reminder_jobs').doc(job._id).update({
    data: { status: 'skipped_relationship_unavailable', updatedAt: now },
  })
  const grant = await getDocument('subscription_grants', job.grantId)
  if (grant?.status === 'reserved') {
    await db.collection('subscription_grants').doc(job.grantId).update({
      data: {
        status: 'invalid',
        invalidReason: 'relationship_unavailable',
        updatedAt: now,
      },
    })
  }
}

async function rescheduleCareJob(job: any, now: Date): Promise<void> {
  const candidate = await nextCareCandidate(job.subjectUserId, job.localDate, now)
  if (!candidate) {
    await db.runTransaction(async (transaction: any) => {
      await transaction.collection('reminder_jobs').doc(job._id).update({
        data: { status: 'waiting_for_plan', updatedAt: now },
      })
      await transaction.collection('subscription_grants').doc(job.grantId).update({
        data: { status: 'available', reservedJobId: command.remove(), updatedAt: now },
      })
    })
    return
  }

  await db.runTransaction(async (transaction: any) => {
    const linkResult = await transaction.collection('care_links').doc(job.careLinkId).get()
    const grantResult = await transaction.collection('subscription_grants').doc(job.grantId).get()
    const link = linkResult.data
    const grant = grantResult.data
    if (
      !link ||
      link.status !== 'active' ||
      link.ownerAllowsOverdue !== true ||
      !grant ||
      grant.status !== 'reserved' ||
      grant.reservedJobId !== job._id
    ) return

    await transaction.collection('reminder_jobs').doc(job._id).update({
      data: {
        status: 'pending',
        regimenVersionId: candidate.regimenVersionId,
        occurrenceId: candidate.occurrenceId,
        localDate: candidate.localDate,
        reminderLocalDate: candidate.reminderLocalDate,
        subjectScheduledLocalTime: candidate.subjectScheduledLocalTime,
        scheduledLocalTime: candidate.scheduledLocalTime,
        regimenKind: candidate.regimenKind,
        planStatus: candidate.planStatus,
        scheduledAt: candidate.scheduledAt,
        attemptCount: 0,
        dispatchToken: command.remove(),
        dispatchStartedAt: command.remove(),
        leaseUntil: command.remove(),
        updatedAt: now,
      },
    })
    await transaction.collection('subscription_grants').doc(job.grantId).update({
      data: { updatedAt: now },
    })
  })
}

async function nextCareCandidate(ownerUserId: string, previousLocalDate: string, now: Date): Promise<any | null> {
  const regimensResult = await db
    .collection('regimen_versions')
    .where({ ownerUserId })
    .orderBy('effectiveFrom', 'asc')
    .get()
  const regimens = regimensResult.data
  const today = localDateInTimeZone(now)
  const afterPrevious = addCalendarDays(parseLocalDate(previousLocalDate), 1)
  let cursor = compareLocalDates(afterPrevious, today) > 0 ? afterPrevious : today

  for (let count = 0; count < 370; count += 1, cursor = addCalendarDays(cursor, 1)) {
    const regimen = [...regimens].reverse().find(
      (item: any) => item.effectiveFrom <= cursor && (item.effectiveTo === undefined || cursor < item.effectiveTo),
    )
    if (!regimen) continue
    const planStatus = getPlanDay(
      parseLocalDate(regimen.startDate),
      cursor,
      cycleForRegimenKind(normalizeRegimenKind(regimen.regimenKind)),
    ).status
    if (!isDoseDay(planStatus)) continue
    const scheduledAt = careReminderAt(localDateTimeToUtc(cursor, regimen.scheduledLocalTime))
    if (scheduledAt.getTime() <= now.getTime()) continue
    const record = await doseRecord(ownerUserId, cursor)
    if (record?.status === 'taken') continue
    return {
      regimenVersionId: regimen._id,
      occurrenceId: stableId(regimen._id, cursor),
      localDate: cursor,
      reminderLocalDate: localDateInTimeZone(scheduledAt),
      subjectScheduledLocalTime: regimen.scheduledLocalTime,
      scheduledLocalTime: chinaTime(scheduledAt),
      regimenKind: normalizeRegimenKind(regimen.regimenKind),
      planStatus,
      scheduledAt,
    }
  }
  return null
}

async function doseRecord(ownerUserId: string, localDate: string): Promise<any | null> {
  const result = await db.collection('dose_records').where({ ownerUserId, localDate }).limit(1).get()
  return result.data[0] ?? null
}

function chinaTime(value: Date): string {
  const shifted = new Date(value.getTime() + 8 * 60 * 60 * 1000)
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
}

function stableId(...parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex')
}

async function claimForAtMostOnce(jobId: string, now: Date): Promise<any | null> {
  const dispatchToken = randomUUID()
  const result = await db
    .collection('reminder_jobs')
    .where({ _id: jobId, status: 'pending' })
    .update({
      data: {
        status: 'dispatching',
        dispatchToken,
        dispatchStartedAt: now,
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        attemptCount: command.inc(1),
        updatedAt: now,
      },
    })
  if (result.stats.updated !== 1) return null
  const job = await getDocument('reminder_jobs', jobId)
  return job?.dispatchToken === dispatchToken ? job : null
}

async function quarantineExpiredDispatches(now: Date): Promise<void> {
  const expired = await db
    .collection('reminder_jobs')
    .where({ status: 'dispatching', leaseUntil: command.lte(now) })
    .limit(BATCH_SIZE)
    .get()

  for (const job of expired.data) {
    await db.runTransaction(async (transaction: any) => {
      await transaction.collection('reminder_jobs').doc(job._id).update({
        data: { status: 'unknown', lastErrorCode: 'DISPATCH_LEASE_EXPIRED', updatedAt: now },
      })
      await transaction.collection('subscription_grants').doc(job.grantId).update({
        data: { status: 'invalid', invalidReason: 'send_outcome_unknown', updatedAt: now },
      })
    })
  }
}

async function doseRecordExists(ownerUserId: string, localDate: string): Promise<boolean> {
  const result = await db.collection('dose_records').where({ ownerUserId, localDate }).limit(1).get()
  return result.data.length > 0
}

async function skipAlreadyRecorded(job: any, now: Date): Promise<void> {
  await db.runTransaction(async (transaction: any) => {
    await transaction.collection('reminder_jobs').doc(job._id).update({
      data: { status: 'skipped_already_recorded', updatedAt: now },
    })
    await transaction.collection('subscription_grants').doc(job.grantId).update({
      data: { status: 'available', reservedJobId: command.remove(), updatedAt: now },
    })
  })
}

async function handleSendFailure(job: any, error: unknown, now: Date): Promise<void> {
  const policy = classifySendFailure(error)
  const errorCode = String((error as { errCode?: unknown })?.errCode ?? 'UNKNOWN')

  if (policy === 'retry' && job.attemptCount < 3) {
    await db.collection('reminder_jobs').doc(job._id).update({
      data: {
        status: 'pending',
        scheduledAt: new Date(now.getTime() + 30_000),
        lastErrorCode: errorCode,
        updatedAt: now,
      },
    })
    return
  }

  const unknown = policy === 'unknown'
  await db.runTransaction(async (transaction: any) => {
    await transaction.collection('reminder_jobs').doc(job._id).update({
      data: {
        status: unknown ? 'unknown' : 'terminal_failed',
        lastErrorCode: errorCode,
        updatedAt: now,
      },
    })
    await transaction.collection('subscription_grants').doc(job.grantId).update({
      data: {
        status: 'invalid',
        invalidReason: unknown ? 'send_outcome_unknown' : errorCode,
        updatedAt: now,
      },
    })
  })
}

async function getDocument(collectionName: string, id: string): Promise<any | null> {
  try {
    const result = await db.collection(collectionName).doc(id).get()
    return result.data ?? null
  } catch {
    return null
  }
}
