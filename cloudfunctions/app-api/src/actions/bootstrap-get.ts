import type { AppContext } from '../context'
import { cycleLength, localDateInTimeZone } from '../../../../packages/domain/src/index'
import { ensureUser, listRegimens, regimenCycleOf, regimenKindOf } from '../helpers'
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
          regimenKind: regimenKindOf(view.regimen),
          startDate: view.regimen.startDate,
          scheduledLocalTime: view.regimen.scheduledLocalTime,
          activeDays: regimenCycleOf(view.regimen).activeDays,
          placeboDays: regimenCycleOf(view.regimen).placeboDays,
          breakDays: regimenCycleOf(view.regimen).breakDays,
          cycleLength: cycleLength(regimenCycleOf(view.regimen)),
          cycleDay: view.today?.cycleDay ?? null,
        }
      : null,
    pendingRegimen: pendingRegimen
      ? {
          id: pendingRegimen._id,
          regimenKind: regimenKindOf(pendingRegimen),
          startDate: pendingRegimen.startDate,
          scheduledLocalTime: pendingRegimen.scheduledLocalTime,
          activeDays: regimenCycleOf(pendingRegimen).activeDays,
          placeboDays: regimenCycleOf(pendingRegimen).placeboDays,
          breakDays: regimenCycleOf(pendingRegimen).breakDays,
          cycleLength: cycleLength(regimenCycleOf(pendingRegimen)),
          effectiveFrom: pendingRegimen.effectiveFrom,
          cycleDay: null,
        }
      : null,
    today: view.today,
    reminder: await reminderCoverage(context),
  }
}
