import { getPlanDay, localDateInTimeZone, localDateTimeToUtc, parseLocalDate } from '../../../../packages/domain/src/index'
import type { AppContext } from '../context'
import { BusinessError } from '../errors'
import {
  claimIdempotency,
  completeIdempotency,
  getDocument,
  listRegimens,
  regimenForDate,
  withoutDocumentId,
} from '../helpers'
import { occurrenceId, type DoseDocument } from '../view'
import { allocateAvailableGrants } from './subscription'

interface SetTodayPayload {
  status?: unknown
  evidence?: {
    uploadId?: unknown
    fileId?: unknown
  }
}

export async function doseSetToday(context: AppContext, payload: SetTodayPayload) {
  if (payload.status !== 'taken' && payload.status !== 'not_taken') {
    throw new BusinessError('INVALID_RECORD_STATUS', '请选择有效的记录状态')
  }

  const today = localDateInTimeZone(context.serverNow)
  const regimen = regimenForDate(await listRegimens(context), today)
  if (!regimen || getPlanDay(parseLocalDate(regimen.startDate), today).status !== 'active') {
    throw new BusinessError('NOT_ACTIVE_DAY', '今天是停药日，无需记录')
  }

  const id = occurrenceId(regimen._id, today)
  const evidence = await validatePhotoEvidence(context, payload.evidence, id, payload.status)
  const idempotency = await claimIdempotency(context, 'dose.setToday', payload)
  if (idempotency.completedResultRef) {
    const existing = await getDocument<DoseDocument>(context.db.collection('dose_records'), id)
    if (existing) return serializeDose(existing)
  }

  const existing = await getDocument<any>(context.db.collection('dose_records'), id)
  const revisions = existing?.status && existing.status !== payload.status
    ? [
        ...(existing.revisions ?? []).slice(-9),
        { fromStatus: existing.status, toStatus: payload.status, changedAt: context.serverNow },
      ]
    : (existing?.revisions ?? [])

  const document = {
    _id: id,
    ownerUserId: context.userId,
    regimenVersionId: regimen._id,
    localDate: today,
    plannedAt: localDateTimeToUtc(today, regimen.scheduledLocalTime),
    status: payload.status,
    firstRecordedAt: existing?.firstRecordedAt ?? context.serverNow,
    lastChangedAt: context.serverNow,
    revisions,
    updatedAt: context.serverNow,
    firstRequestId: existing?.firstRequestId ?? context.requestId,
    lastRequestId: context.requestId,
    evidenceType: evidence ? 'photo' : 'none',
    ...(evidence ? { evidenceFileId: evidence.fileId, evidenceUploadId: evidence.uploadId } : {}),
  }

  await context.db.runTransaction(async (transaction: any) => {
    if (evidence) {
      const ticketResult = await transaction.collection('photo_uploads').doc(evidence.uploadId).get()
      const ticket = ticketResult.data
      if (!ticket || ticket.status !== 'prepared') {
        throw new BusinessError('PHOTO_TICKET_INVALID', '照片上传凭据已失效，请重新拍照')
      }
      await transaction.collection('photo_uploads').doc(evidence.uploadId).update({
        data: { status: 'bound', boundAt: context.serverNow, doseRecordId: id },
      })
    }
    await transaction.collection('dose_records').doc(id).set({ data: withoutDocumentId(document) })
  })

  const pendingJobs = await context.db
    .collection('reminder_jobs')
    .where({ occurrenceId: id, recipientUserId: context.userId, status: 'pending' })
    .get()
  for (const job of pendingJobs.data) {
    await context.db.runTransaction(async (transaction: any) => {
      await transaction.collection('reminder_jobs').doc(job._id).update({
        data: { status: 'skipped_already_recorded', updatedAt: context.serverNow },
      })
      await transaction.collection('subscription_grants').doc(job.grantId).update({
        data: { status: 'available', reservedJobId: context.command.remove(), updatedAt: context.serverNow },
      })
    })
  }

  const templateId = process.env.SELF_DUE_TEMPLATE_ID
  if (pendingJobs.data.length > 0 && templateId && templateId !== 'configure-in-cloud-console') {
    try {
      await allocateAvailableGrants(context, templateId)
    } catch {
      console.error(JSON.stringify({ event: 'grant.reallocation_failed', requestId: context.requestId }))
    }
  }

  await completeIdempotency(context, idempotency.id, id)
  return serializeDose(document)
}

async function validatePhotoEvidence(
  context: AppContext,
  input: SetTodayPayload['evidence'],
  occurrence: string,
  status: unknown,
): Promise<{ uploadId: string; fileId: string } | null> {
  if (input === undefined) return null
  if (status !== 'taken' || typeof input.uploadId !== 'string' || typeof input.fileId !== 'string') {
    throw new BusinessError('PHOTO_EVIDENCE_INVALID', '照片记录信息无效，请重新拍照')
  }
  const ticket = await getDocument<any>(context.db.collection('photo_uploads'), input.uploadId)
  if (
    !ticket ||
    ticket.ownerUserId !== context.userId ||
    ticket.occurrenceId !== occurrence ||
    ticket.status !== 'prepared' ||
    !(ticket.expiresAt instanceof Date) ||
    ticket.expiresAt.getTime() <= context.serverNow.getTime() ||
    !input.fileId.endsWith(`/${ticket.cloudPath}`)
  ) {
    throw new BusinessError('PHOTO_TICKET_INVALID', '照片上传凭据已失效，请重新拍照')
  }
  return { uploadId: input.uploadId, fileId: input.fileId }
}

function serializeDose(document: any) {
  return {
    ...document,
    plannedAt: document.plannedAt.toISOString(),
    firstRecordedAt: document.firstRecordedAt.toISOString(),
    lastChangedAt: document.lastChangedAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}
