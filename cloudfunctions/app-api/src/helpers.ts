import { createHash } from 'node:crypto'
import {
  cycleForRegimenKind,
  normalizeRegimenKind,
  type RegimenCycle,
  type RegimenKind,
} from '../../../packages/domain/src/index'
import { BusinessError } from './errors'
import type { AppContext } from './context'

export function stableId(...parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex')
}

export function withoutDocumentId<T extends { _id: string }>(document: T): Omit<T, '_id'> {
  const { _id: _documentId, ...data } = document
  return data
}

export async function getDocument<T>(collection: any, id: string): Promise<T | null> {
  try {
    const result = await collection.doc(id).get()
    return (result.data ?? null) as T | null
  } catch {
    return null
  }
}

export async function ensureUser(context: AppContext): Promise<void> {
  const users = context.db.collection('users')
  const existing = await getDocument(users, context.userId)
  if (existing) return

  await users.doc(context.userId).set({
    data: withoutDocumentId({
      _id: context.userId,
      openid: context.openid,
      appid: context.appid,
      timezone: 'Asia/Shanghai',
      createdAt: context.serverNow,
      updatedAt: context.serverNow,
    }),
  })
}

export interface RegimenDocument {
  _id: string
  ownerUserId: string
  regimenKind?: RegimenKind
  startDate: string
  activeDays: number
  placeboDays?: number
  breakDays: number
  scheduledLocalTime: string
  timezone: 'Asia/Shanghai'
  effectiveFrom: string
  effectiveTo?: string
  status: 'active' | 'superseded'
  createdAt: Date
}

export function regimenKindOf(regimen: RegimenDocument): RegimenKind {
  return normalizeRegimenKind(regimen.regimenKind)
}

export function regimenCycleOf(regimen: RegimenDocument): RegimenCycle {
  return cycleForRegimenKind(regimenKindOf(regimen))
}

export async function listRegimens(context: AppContext): Promise<RegimenDocument[]> {
  return listRegimensForUser(context, context.userId)
}

export async function listRegimensForUser(context: AppContext, ownerUserId: string): Promise<RegimenDocument[]> {
  const result = await context.db
    .collection('regimen_versions')
    .where({ ownerUserId })
    .orderBy('effectiveFrom', 'asc')
    .get()
  return result.data as RegimenDocument[]
}

export function regimenForDate(regimens: RegimenDocument[], localDate: string): RegimenDocument | null {
  return (
    [...regimens]
      .reverse()
      .find(
        (regimen) =>
          regimen.effectiveFrom <= localDate &&
          (regimen.effectiveTo === undefined || localDate < regimen.effectiveTo),
      ) ?? null
  )
}

export async function claimIdempotency(
  context: AppContext,
  action: string,
  payload: unknown,
): Promise<{ id: string; completedResultRef?: string }> {
  const id = stableId(context.userId, action, context.requestId)
  const payloadHash = stableId(JSON.stringify(payload))
  const collection = context.db.collection('idempotency_requests')
  try {
    await collection.add({
      data: {
      _id: id,
      userId: context.userId,
      action,
      requestId: context.requestId,
      payloadHash,
      status: 'processing',
      createdAt: context.serverNow,
      expiresAt: new Date(context.serverNow.getTime() + 7 * 86_400_000),
      },
    })
    return { id }
  } catch {
    const existing = await getDocument<any>(collection, id)
    if (!existing) throw new BusinessError('IDEMPOTENCY_CLAIM_FAILED', '请求暂时无法处理', true)
    if (existing.payloadHash !== payloadHash) {
      throw new BusinessError('IDEMPOTENCY_CONFLICT', '请求标识对应的内容不一致')
    }
    if (existing.status === 'completed') return { id, completedResultRef: existing.resultRef }
    throw new BusinessError('REQUEST_IN_PROGRESS', '请求正在处理中', true)
  }
}

export async function completeIdempotency(
  context: AppContext,
  id: string,
  resultRef: string,
): Promise<void> {
  await context.db.collection('idempotency_requests').doc(id).update({
    data: {
      status: 'completed',
      resultRef,
      completedAt: context.serverNow,
    },
  })
}
