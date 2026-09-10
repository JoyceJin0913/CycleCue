import { createHash } from 'node:crypto'
import type { AppContext } from '../context'
import { BusinessError } from '../errors'
import { ensureUser, getDocument, stableId, withoutDocumentId } from '../helpers'
import { todayView } from '../view'
import {
  cancelCareReminderCoverage,
  careReminderCoverage,
  ownerAllowsCareReminder,
  readRelationshipId,
  type CareLinkDocument,
} from '../care-reminders'

const INVITE_TTL_MS = 48 * 60 * 60 * 1000
const MAX_ACTIVE_CAREGIVERS = 3

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function label(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 12)
  return normalized || fallback
}

function readToken(payload: { token?: unknown }): string {
  if (typeof payload.token !== 'string' || !/^[a-f0-9]{64}$/.test(payload.token)) {
    throw new BusinessError('INVITE_INVALID', '邀请链接无效')
  }
  return payload.token
}

export async function careInviteCreate(context: AppContext, payload: { ownerLabel?: unknown }) {
  await ensureUser(context)
  const active = await context.db.collection('care_links').where({ ownerUserId: context.userId, status: 'active' }).count()
  if (active.total >= MAX_ACTIVE_CAREGIVERS) {
    throw new BusinessError('CAREGIVER_LIMIT_REACHED', '最多邀请 3 位朋友')
  }

  const token = stableId(context.userId, 'care-invite', context.requestId)
  const id = tokenHash(token)
  const invites = context.db.collection('care_invites')
  const existing = await getDocument<any>(invites, id)
  if (existing) {
    return { token, ownerLabel: existing.ownerLabel, expiresAt: existing.expiresAt.toISOString() }
  }

  const expiresAt = new Date(context.serverNow.getTime() + INVITE_TTL_MS)
  const ownerLabel = label(payload.ownerLabel, '一位朋友')
  await invites.add({
    data: {
      _id: id,
      ownerUserId: context.userId,
      ownerLabel,
      status: 'pending',
      createdAt: context.serverNow,
      expiresAt,
    },
  })
  return { token, ownerLabel, expiresAt: expiresAt.toISOString() }
}

export async function careInvitePreview(context: AppContext, payload: { token?: unknown }) {
  const token = readToken(payload)
  const invite = await getDocument<any>(context.db.collection('care_invites'), tokenHash(token))
  if (!invite || invite.status !== 'pending' || !(invite.expiresAt instanceof Date) || invite.expiresAt <= context.serverNow) {
    throw new BusinessError('INVITE_UNAVAILABLE', '邀请已失效，请让朋友重新发送')
  }
  if (invite.ownerUserId === context.userId) {
    throw new BusinessError('INVITE_SELF', '不能领取自己发出的邀请')
  }
  return { ownerLabel: invite.ownerLabel, expiresAt: invite.expiresAt.toISOString() }
}

export async function careInviteClaim(
  context: AppContext,
  payload: { token?: unknown; caregiverLabel?: unknown },
) {
  await ensureUser(context)
  const token = readToken(payload)
  const inviteId = tokenHash(token)
  const invite = await getDocument<any>(context.db.collection('care_invites'), inviteId)
  if (!invite || invite.status !== 'pending' || !(invite.expiresAt instanceof Date) || invite.expiresAt <= context.serverNow) {
    throw new BusinessError('INVITE_UNAVAILABLE', '邀请已失效，请让朋友重新发送')
  }
  if (invite.ownerUserId === context.userId) throw new BusinessError('INVITE_SELF', '不能领取自己发出的邀请')

  const active = await context.db.collection('care_links').where({ ownerUserId: invite.ownerUserId, status: 'active' }).count()
  if (active.total >= MAX_ACTIVE_CAREGIVERS) throw new BusinessError('CAREGIVER_LIMIT_REACHED', '对方的朋友名额已满')

  const linkId = stableId(invite.ownerUserId, context.userId, 'care-link')
  const link = {
    _id: linkId,
    ownerUserId: invite.ownerUserId,
    caregiverUserId: context.userId,
    ownerLabel: invite.ownerLabel,
    caregiverLabel: label(payload.caregiverLabel, '一位朋友'),
    status: 'active' as const,
    canViewHistoryDays: 0,
    canViewEvidence: false,
    ownerAllowsOverdue: false,
    notifyOnOverdue: false,
    createdAt: context.serverNow,
  }

  await context.db.runTransaction(async (transaction: any) => {
    const currentResult = await transaction.collection('care_invites').doc(inviteId).get()
    const current = currentResult.data
    if (!current || current.status !== 'pending' || current.expiresAt <= context.serverNow) {
      throw new BusinessError('INVITE_UNAVAILABLE', '邀请已被领取或已失效')
    }
    const existingLinkResult = await transaction.collection('care_links').doc(linkId).get()
    if (existingLinkResult.data?.status === 'active') {
      throw new BusinessError('CARE_LINK_EXISTS', '你已经在关注这位朋友')
    }
    const activeLinks = await transaction
      .collection('care_links')
      .where({ ownerUserId: invite.ownerUserId, status: 'active' })
      .get()
    if (activeLinks.data.length >= MAX_ACTIVE_CAREGIVERS) {
      throw new BusinessError('CAREGIVER_LIMIT_REACHED', '对方的朋友名额已满')
    }
    await transaction.collection('care_links').doc(linkId).set({ data: withoutDocumentId(link) })
    await transaction.collection('care_invites').doc(inviteId).update({
      data: { status: 'claimed', claimedByUserId: context.userId, claimedAt: context.serverNow },
    })
  })
  return { joined: true, ownerLabel: link.ownerLabel }
}

export async function careList(context: AppContext) {
  const [ownerResult, caregiverResult] = await Promise.all([
    context.db.collection('care_links').where({ ownerUserId: context.userId, status: 'active' }).get(),
    context.db.collection('care_links').where({ caregiverUserId: context.userId, status: 'active' }).get(),
  ])

  const watching = await Promise.all(
    caregiverResult.data.map(async (link: CareLinkDocument) => {
      const view = await todayView(context, undefined, link.ownerUserId)
      const today = view.today
      return {
        relationshipId: link._id,
        ownerLabel: link.ownerLabel,
        overdueNotificationsAllowed: ownerAllowsCareReminder(link),
        reminder: await careReminderCoverage(context, link._id),
        today: today
          ? {
              localDate: today.localDate,
              displayDate: today.displayDate,
              planStatus: today.planStatus,
              viewState: today.viewState,
              scheduledLocalTime: today.scheduledLocalTime,
              recordStatus: today.recordStatus,
              lastChangedAt: today.lastChangedAt,
            }
          : null,
      }
    }),
  )

  const caregivers = await Promise.all(
    ownerResult.data.map(async (link: CareLinkDocument) => ({
      relationshipId: link._id,
      caregiverLabel: link.caregiverLabel,
      overdueNotificationsAllowed: ownerAllowsCareReminder(link),
      reminder: await careReminderCoverage(context, link._id, link.caregiverUserId),
    })),
  )

  return {
    caregivers,
    watching,
    reminderTemplateConfigured: Boolean(
      (process.env.CAREGIVER_OVERDUE_TEMPLATE_ID ?? process.env.SELF_DUE_TEMPLATE_ID) &&
      (process.env.CAREGIVER_OVERDUE_TEMPLATE_ID ?? process.env.SELF_DUE_TEMPLATE_ID) !== 'configure-in-cloud-console'
    ),
    remainingInviteSlots: Math.max(0, MAX_ACTIVE_CAREGIVERS - ownerResult.data.length),
  }
}

export async function careOverduePermissionSet(
  context: AppContext,
  payload: { relationshipId?: unknown; enabled?: unknown },
) {
  const relationshipId = readRelationshipId(payload.relationshipId)
  if (typeof payload.enabled !== 'boolean') {
    throw new BusinessError('CARE_PERMISSION_INVALID', '请选择有效的提醒权限')
  }
  const link = await getDocument<CareLinkDocument>(context.db.collection('care_links'), relationshipId)
  if (!link || link.status !== 'active' || link.ownerUserId !== context.userId) {
    throw new BusinessError('CARE_LINK_FORBIDDEN', '你无法修改这段朋友关系')
  }

  await context.db.collection('care_links').doc(relationshipId).update({
    data: {
      ownerAllowsOverdue: payload.enabled,
      notifyOnOverdue: payload.enabled,
      updatedAt: context.serverNow,
    },
  })
  if (!payload.enabled) {
    await cancelCareReminderCoverage(context, relationshipId, 'cancelled_by_owner')
  }
  return { relationshipId, overdueNotificationsAllowed: payload.enabled }
}

export async function careReminderDisable(context: AppContext, payload: { relationshipId?: unknown }) {
  const relationshipId = readRelationshipId(payload.relationshipId)
  const link = await getDocument<CareLinkDocument>(context.db.collection('care_links'), relationshipId)
  if (!link || link.status !== 'active' || link.caregiverUserId !== context.userId) {
    throw new BusinessError('CARE_LINK_FORBIDDEN', '你无法关闭这段朋友关系的提醒')
  }
  await cancelCareReminderCoverage(context, relationshipId, 'cancelled_by_friend')
  return { relationshipId, disabled: true }
}

export async function careLinkRemove(context: AppContext, payload: { relationshipId?: unknown }) {
  const relationshipId = readRelationshipId(payload.relationshipId)
  const link = await getDocument<CareLinkDocument>(context.db.collection('care_links'), relationshipId)
  if (!link || (link.ownerUserId !== context.userId && link.caregiverUserId !== context.userId)) {
    throw new BusinessError('CARE_LINK_FORBIDDEN', '你无法结束这段朋友关系')
  }
  if (link.status === 'active') {
    await context.db.collection('care_links').doc(relationshipId).update({
      data: {
        status: 'inactive',
        ownerAllowsOverdue: false,
        notifyOnOverdue: false,
        endedByUserId: context.userId,
        endedAt: context.serverNow,
        updatedAt: context.serverNow,
      },
    })
    await cancelCareReminderCoverage(context, relationshipId, 'relationship_ended')
  }
  return { relationshipId, removed: true }
}
