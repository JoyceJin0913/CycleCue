import { localDateInTimeZone } from '../../domain/local-date'
import { callApi } from '../../services/api-client'
import type { CalendarCellDto, MonthDto, TodayViewState } from '../../services/api-types'

interface CalendarCellView extends CalendarCellDto {
  symbol: string
}

const stateSymbol: Record<TodayViewState, string> = {
  before_start: '',
  break: '○',
  future: '●',
  unrecorded_overdue: '!',
  taken: '✓',
  not_taken: '—',
}

const stateDescription: Record<TodayViewState, string> = {
  before_start: '方案尚未开始',
  break: '停药日',
  future: '服药日，尚未到计划时间',
  unrecorded_overdue: '服药日，已到时间但尚未记录',
  taken: '已记录服用',
  not_taken: '已记录未服',
}

function currentYearMonth(): string {
  return localDateInTimeZone(new Date()).slice(0, 7)
}

function shiftMonth(yearMonth: string, offset: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const shifted = new Date(Date.UTC(year!, month! - 1 + offset, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function displayMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-')
  return `${year} 年 ${Number(month)} 月`
}

Page({
  data: {
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    yearMonth: currentYearMonth(),
    monthTitle: displayMonth(currentYearMonth()),
    cells: [] as CalendarCellView[],
    loading: true,
    errorMessage: '',
    selectedDate: '',
    selectedDetail: null as { localDate: string; description: string } | null,
  },

  onShow() {
    void this.refresh()
  },

  onPullDownRefresh() {
    void this.refresh().finally(() => wx.stopPullDownRefresh())
  },

  async refresh() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const result = await callApi<MonthDto>('dose.getMonth', { yearMonth: this.data.yearMonth })
      const cells = result.cells.map((cell) => ({ ...cell, symbol: stateSymbol[cell.state] }))
      this.setData({ cells, loading: false, monthTitle: displayMonth(result.yearMonth) })
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error instanceof Error ? error.message : '日历加载失败',
      })
    }
  },

  previousMonth() {
    this.changeMonth(-1)
  },

  nextMonth() {
    this.changeMonth(1)
  },

  changeMonth(offset: number) {
    const yearMonth = shiftMonth(this.data.yearMonth, offset)
    this.setData({ yearMonth, monthTitle: displayMonth(yearMonth), selectedDetail: null, selectedDate: '' })
    void this.refresh()
  },

  selectDate(event: WechatMiniprogram.TouchEvent) {
    const localDate = String(event.currentTarget.dataset.date)
    const cell = this.data.cells.find((candidate) => candidate.localDate === localDate)
    if (!cell) return
    this.setData({
      selectedDate: localDate,
      selectedDetail: { localDate, description: stateDescription[cell.state] },
    })
  },
})
