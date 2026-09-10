import { runtimeConfig } from '../config/runtime'
import { callApi, createRequestId } from './api-client'

export type SubscriptionChoice = 'accept' | 'reject' | 'ban' | 'filter' | 'unavailable' | 'failed'

const PENDING_KEY = 'cycle-cue:pending-subscriptions'

interface PendingSelfSubscription {
  requestId: string
  templateKey: 'SELF_DUE'
  source: 'onboarding' | 'dose_confirm' | 'manual_enable'
}

interface PendingCareSubscription {
  requestId: string
  templateKey: 'CAREGIVER_OVERDUE'
  source: 'care_manual'
  relationshipId: string
}

type PendingSubscription = PendingSelfSubscription | PendingCareSubscription

function readPending(): PendingSubscription[] {
  return (wx.getStorageSync(PENDING_KEY) as PendingSubscription[] | undefined) ?? []
}

function writePending(items: PendingSubscription[]): void {
  wx.setStorageSync(PENDING_KEY, items)
}

export async function requestSelfDueSubscription(): Promise<SubscriptionChoice> {
  return requestSubscription(runtimeConfig.selfDueTemplateId)
}

export async function requestCareOverdueSubscription(): Promise<SubscriptionChoice> {
  return requestSubscription(runtimeConfig.careOverdueTemplateId)
}

async function requestSubscription(templateId: string): Promise<SubscriptionChoice> {
  if (!templateId || !wx.requestSubscribeMessage) return 'unavailable'

  try {
    const result = (await wx.requestSubscribeMessage({ tmplIds: [templateId] })) as Record<string, string>
    const choice = result[templateId]
    return choice === 'accept' || choice === 'reject' || choice === 'ban' || choice === 'filter'
      ? choice
      : 'failed'
  } catch {
    return 'failed'
  }
}

export async function registerAcceptedSubscription(
  source: PendingSelfSubscription['source'],
): Promise<boolean> {
  const item: PendingSelfSubscription = {
    requestId: createRequestId(),
    templateKey: 'SELF_DUE',
    source,
  }
  const pending = [...readPending(), item]
  writePending(pending)

  try {
    await callApi('subscription.register', item, item.requestId)
    writePending(readPending().filter((candidate) => candidate.requestId !== item.requestId))
    return true
  } catch {
    return false
  }
}

export async function registerAcceptedCareOverdueSubscription(relationshipId: string): Promise<boolean> {
  const item: PendingCareSubscription = {
    requestId: createRequestId(),
    templateKey: 'CAREGIVER_OVERDUE',
    source: 'care_manual',
    relationshipId,
  }
  const pending = [...readPending(), item]
  writePending(pending)

  try {
    await callApi('subscription.register', item, item.requestId)
    writePending(readPending().filter((candidate) => candidate.requestId !== item.requestId))
    return true
  } catch {
    return false
  }
}

export async function flushPendingSubscriptions(): Promise<void> {
  for (const item of readPending()) {
    try {
      await callApi('subscription.register', item, item.requestId)
      writePending(readPending().filter((candidate) => candidate.requestId !== item.requestId))
    } catch {
      return
    }
  }
}
