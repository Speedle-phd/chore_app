import { Temporal } from 'temporal-polyfill'
import { FIRST_SUPPORTED_YEAR, HOLIDAYS, type HolidayRow, type HolidayRule, type StateCode } from './holidayCatalog.de'

export type Holiday = {
   /** `YYYY-MM-DD`. */
   date: string
   id: string
   name: string
   /** Only a holiday in some municipalities of the state. */
   partial: boolean
}

/** Easter Sunday in the Gregorian calendar (anonymous Gregorian / Meeus–Jones–Butcher algorithm). */
export function easterSunday(year: number): Temporal.PlainDate {
   const a = year % 19
   const b = Math.floor(year / 100)
   const c = year % 100
   const d = Math.floor(b / 4)
   const e = b % 4
   const f = Math.floor((b + 8) / 25)
   const g = Math.floor((b - f + 1) / 3)
   const h = (19 * a + b - d - g + 15) % 30
   const i = Math.floor(c / 4)
   const k = c % 4
   const l = (32 + 2 * e + 2 * i - h - k) % 7
   const m = Math.floor((a + 11 * h + 22 * l) / 451)
   const month = Math.floor((h + l - 7 * m + 114) / 31)
   const day = ((h + l - 7 * m + 114) % 31) + 1
   return Temporal.PlainDate.from({ year, month, day })
}

/** The Wednesday before 23 November (Buß- und Bettag): between 16 and 22 November. */
export function bussUndBettag(year: number): Temporal.PlainDate {
   const nov22 = Temporal.PlainDate.from({ year, month: 11, day: 22 })
   return nov22.subtract({ days: (nov22.dayOfWeek - 3 + 7) % 7 })
}

function dateOf(rule: HolidayRule, year: number): Temporal.PlainDate {
   switch (rule.type) {
      case 'fixed':
         return Temporal.PlainDate.from({ year, month: rule.month, day: rule.day })
      case 'easter':
         return easterSunday(year).add({ days: rule.offset })
      case 'bussUndBettag':
         return bussUndBettag(year)
   }
}

const appliesInYear = (row: HolidayRow, year: number) =>
   (row.years ? row.years.includes(year) : true) && (row.from === undefined || year >= row.from) && (row.until === undefined || year <= row.until)

/** Public holidays of one year in a state, by date. A full holiday wins over a partial one on the same day. */
export function holidaysInYear(state: StateCode, year: number): Holiday[] {
   if (year < FIRST_SUPPORTED_YEAR) return []
   const byId = new Map<string, Holiday>()
   for (const row of HOLIDAYS) {
      if (!appliesInYear(row, year)) continue
      const full = row.states === 'all' || row.states.includes(state)
      const partial = !full && (row.partialIn?.includes(state) ?? false)
      if (!full && !partial) continue
      const existing = byId.get(row.id)
      if (existing && !existing.partial) continue
      byId.set(row.id, { date: dateOf(row.rule, year).toString(), id: row.id, name: row.name, partial })
   }
   return [...byId.values()].sort((x, y) => x.date.localeCompare(y.date))
}

/** Public holidays in a state on local dates [from, to) (`YYYY-MM-DD`). */
export function holidaysBetween(state: StateCode, from: string, to: string): Holiday[] {
   const start = Temporal.PlainDate.from(from)
   const end = Temporal.PlainDate.from(to)
   const result: Holiday[] = []
   for (let year = start.year; year <= end.year; year++) {
      for (const h of holidaysInYear(state, year)) if (h.date >= from && h.date < to) result.push(h)
   }
   return result
}
