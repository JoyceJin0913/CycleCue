import type { AppContext } from '../context'
import { localDateInTimeZone } from '../../../../packages/domain/src/index'
import { ensureUser, listRegimens } from '../helpers'
import { reminderCoverage, todayView } from '../view'

export async function bootstrapGet(context: AppContext) {
  await ensureUser(context)
  const [regimens, careLinks] = await Promise.all([
    listRegimens(context),
    context.db.collection('care_links').where({ caregiverUserId: context.userId, status: 'active' }).limit(1).get(),
  ])
  const view = await todayView(context, regimens)
  const today = localDateInTimeZone(context.serverNow)
  const pendingRegimen = regimens.find((item) => item.effectiveFrom > today) ?? null
  return {
    hasRegimen: regimens.length > 0,
    hasCareLinks: careLinks.data.length > 0,
    regimen: view.regimen
      ? {
          id: view.regimen._id,
          startDate: view.regimen.startDate,
          scheduledLocalTime: view.regimen.scheduledLocalTime,
          cycleDay: view.today?.cycleDay ?? null,
        }
      : null,
    pendingRegimen: pendingRegimen
      ? {
          id: pendingRegimen._id,
          startDate: pendingRegimen.startDate,
          scheduledLocalTime: pendingRegimen.scheduledLocalTime,
          effectiveFrom: pendingRegimen.effectiveFrom,
          cycleDay: null,
        }
      : null,
    today: view.today,
    reminder: await reminderCoverage(context),
  }
}
