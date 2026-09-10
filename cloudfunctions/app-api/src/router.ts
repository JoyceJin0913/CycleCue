import type { AppContext } from './context'
import { BusinessError } from './errors'
import { bootstrapGet } from './actions/bootstrap-get'
import { doseGetMonth } from './actions/dose-get-month'
import { doseSetToday } from './actions/dose-set-today'
import { photoPrepareUpload } from './actions/photo-prepare-upload'
import { regimenSave } from './actions/regimen-save'
import { subscriptionGetStatus, subscriptionRegister } from './actions/subscription'
import {
  careInviteClaim,
  careInviteCreate,
  careInvitePreview,
  careLinkRemove,
  careList,
  careOverduePermissionSet,
  careReminderDisable,
} from './actions/care'

type Handler = (context: AppContext, payload: any) => Promise<unknown>

const handlers: Record<string, Handler> = {
  'bootstrap.get': bootstrapGet,
  'regimen.save': regimenSave,
  'dose.setToday': doseSetToday,
  'photo.prepareUpload': photoPrepareUpload,
  'dose.getMonth': doseGetMonth,
  'subscription.register': subscriptionRegister,
  'subscription.getStatus': subscriptionGetStatus,
  'care.invite.create': careInviteCreate,
  'care.invite.preview': careInvitePreview,
  'care.invite.claim': careInviteClaim,
  'care.list': careList,
  'care.overduePermission.set': careOverduePermissionSet,
  'care.reminder.disable': careReminderDisable,
  'care.link.remove': careLinkRemove,
}

export async function routeAction(context: AppContext, action: string, payload: unknown) {
  const handler = handlers[action]
  if (!handler) throw new BusinessError('UNKNOWN_ACTION', '不支持的操作')
  return handler(context, payload ?? {})
}
