import {
  addCalendarDays,
  civilDayOrdinal,
  deriveDayViewState,
  fromCivilDayOrdinal,
  getPlanDay,
  localDateTimeToUtc,
  parseLocalDate,
} from '../../../../packages/domain/src/index'
import type { AppContext } from '../context'
import { BusinessError } from '../errors'
import { listRegimens, regimenCycleOf, regimenForDate, regimenKindOf } from '../helpers'

interface GetMonthPayload {
  yearMonth?: unknown
}

export async function doseGetMonth(context: AppContext, payload: GetMonthPayload) {
  if (typeof payload.yearMonth !== 'string' || !/^\d{4}-\d{2}$/.test(payload.yearMonth)) {
    throw new BusinessError('INVALID_MONTH', '请选择有效月份')
  }

  const first = parseLocalDate(`${payload.yearMonth}-01`)
  const firstWeekday = new Date(civilDayOrdinal(first) * 86_400_000).getUTCDay()
  const mondayOffset = (firstWeekday + 6) % 7
  const gridStart = addCalendarDays(first, -mondayOffset)
  const gridEnd = addCalendarDays(gridStart, 41)
  const regimens = await listRegimens(context)
  const recordsResult = await context.db
    .collection('dose_records')
    .where({
      ownerUserId: context.userId,
      localDate: context.command.gte(gridStart).and(context.command.lte(gridEnd)),
    })
    .get()
  const records = new Map(recordsResult.data.map((record: any) => [record.localDate, record]))

  const cells = Array.from({ length: 42 }, (_, index) => {
    const localDate = fromCivilDayOrdinal(civilDayOrdinal(gridStart) + index)
    const regimen = regimenForDate(regimens, localDate) ?? regimens.find((item) => item.startDate > localDate)
    if (!regimen) {
      return {
        localDate,
        dayOfMonth: Number(localDate.slice(8, 10)),
        inCurrentMonth: localDate.startsWith(payload.yearMonth as string),
        regimenKind: null,
        planStatus: 'before_start' as const,
        state: 'before_start' as const,
      }
    }

    const plan = getPlanDay(parseLocalDate(regimen.startDate), localDate, regimenCycleOf(regimen))
    const record = records.get(localDate) as any
    const plannedAt = localDateTimeToUtc(localDate, regimen.scheduledLocalTime)
    return {
      localDate,
      dayOfMonth: Number(localDate.slice(8, 10)),
      inCurrentMonth: localDate.startsWith(payload.yearMonth as string),
      regimenKind: regimenKindOf(regimen),
      planStatus: plan.status,
      state: deriveDayViewState({
        planStatus: plan.status,
        recordStatus: record?.status ?? null,
        plannedAtMs: plannedAt.getTime(),
        nowMs: context.serverNow.getTime(),
      }),
    }
  })

  return { yearMonth: payload.yearMonth, cells }
}
