import { getPlanDay, isDoseDay, localDateInTimeZone, parseLocalDate } from '../../../../packages/domain/src/index'
import type { AppContext } from '../context'
import { BusinessError } from '../errors'
import { getDocument, listRegimens, regimenCycleOf, regimenForDate, stableId } from '../helpers'
import { occurrenceId } from '../view'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png'])

interface PreparePhotoPayload {
  extension?: unknown
  size?: unknown
}

export async function photoPrepareUpload(context: AppContext, payload: PreparePhotoPayload) {
  const extension = typeof payload.extension === 'string' ? payload.extension.toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new BusinessError('PHOTO_TYPE_NOT_ALLOWED', '照片格式仅支持 JPG 或 PNG')
  }
  if (typeof payload.size !== 'number' || !Number.isFinite(payload.size) || payload.size <= 0 || payload.size > MAX_PHOTO_BYTES) {
    throw new BusinessError('PHOTO_TOO_LARGE', '照片不能超过 5 MB，请重拍或无照片记录')
  }

  const today = localDateInTimeZone(context.serverNow)
  const regimen = regimenForDate(await listRegimens(context), today)
  if (!regimen || !isDoseDay(getPlanDay(parseLocalDate(regimen.startDate), today, regimenCycleOf(regimen)).status)) {
    throw new BusinessError('NOT_ACTIVE_DAY', '今天无需服药，无需拍照记录')
  }

  const uploadId = stableId(context.userId, 'photo-upload', context.requestId)
  const uploads = context.db.collection('photo_uploads')
  const existing = await getDocument<any>(uploads, uploadId)
  if (existing) {
    return {
      uploadId,
      cloudPath: existing.cloudPath,
      maxBytes: MAX_PHOTO_BYTES,
      expiresAt: existing.expiresAt.toISOString(),
    }
  }

  const occurrence = occurrenceId(regimen._id, today)
  const cloudPath = `users/${context.userId}/dose-evidence/${occurrence}/${uploadId}.${extension}`
  const expiresAt = new Date(context.serverNow.getTime() + 60 * 60 * 1000)
  await uploads.add({
    data: {
      _id: uploadId,
      ownerUserId: context.userId,
      occurrenceId: occurrence,
      cloudPath,
      expectedBytes: payload.size,
      maxBytes: MAX_PHOTO_BYTES,
      status: 'prepared',
      createdAt: context.serverNow,
      expiresAt,
    },
  })

  return { uploadId, cloudPath, maxBytes: MAX_PHOTO_BYTES, expiresAt: expiresAt.toISOString() }
}
