import { randomUUID } from 'node:crypto'
import * as cloud from 'wx-server-sdk'
import { classifySendFailure } from './error-policy'

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
      if (await doseRecordExists(job.recipientUserId, job.localDate)) {
        await skipAlreadyRecorded(job, now)
        skipped += 1
        continue
      }

      const user = await getDocument('users', job.recipientUserId)
      if (!user?.openid) throw Object.assign(new Error('RECIPIENT_NOT_FOUND'), { errCode: 43101 })

      await (cloud as any).openapi.subscribeMessage.send({
        touser: user.openid,
        templateId: job.templateId,
        page: 'pages/today/index?from=reminder',
        miniprogramState: process.env.MINIPROGRAM_STATE ?? 'developer',
        lang: 'zh_CN',
        data: buildTemplateData(job),
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

function buildTemplateData(job: any) {
  return {
    thing1: { value: '每日记录提醒' },
    time2: { value: `${job.localDate} ${job.scheduledLocalTime}` },
    thing3: { value: '请进入小程序确认今天是否完成' },
  }
}

async function getDocument(collectionName: string, id: string): Promise<any | null> {
  try {
    const result = await db.collection(collectionName).doc(id).get()
    return result.data ?? null
  } catch {
    return null
  }
}
