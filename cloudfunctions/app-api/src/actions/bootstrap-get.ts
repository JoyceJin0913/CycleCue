import type { AppContext } from '../context'
import { ensureUser, listRegimens } from '../helpers'
import { reminderCoverage, todayView } from '../view'

export async function bootstrapGet(context: AppContext) {
  await ensureUser(context)
  const regimens = await listRegimens(context)
  const view = await todayView(context, regimens)
  return {
    hasRegimen: regimens.length > 0,
    regimen: view.regimen
      ? {
          id: view.regimen._id,
          startDate: view.regimen.startDate,
          scheduledLocalTime: view.regimen.scheduledLocalTime,
          cycleDay: view.today?.cycleDay ?? null,
        }
      : null,
    today: view.today,
    reminder: await reminderCoverage(context),
  }
}
