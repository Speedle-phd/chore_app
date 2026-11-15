import { Temporal } from 'temporal-polyfill'

/** Pure helpers for the date and time pickers. Dates are `YYYY-MM-DD`, times `HH:mm` (24 h). */

/** Weeks (Monday first) covering the month of `yearMonth` (`YYYY-MM`), padded with neighbouring days. */
export function monthGrid(yearMonth: string, firstDay = 1): string[][] {
   const first = Temporal.PlainYearMonth.from(yearMonth).toPlainDate({ day: 1 })
   const offset = (first.dayOfWeek - firstDay + 7) % 7
   let day = first.subtract({ days: offset })
   const weeks: string[][] = []
   do {
      const week: string[] = []
      for (let i = 0; i < 7; i++) {
         week.push(day.toString())
         day = day.add({ days: 1 })
      }
      weeks.push(week)
   } while (day.month === first.month)
   return weeks
}

export const addDays = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString()
export const addMonthsClamped = (date: string, months: number) => Temporal.PlainDate.from(date).add({ months }).toString()
export const yearMonthOf = (date: string) => date.slice(0, 7)

/** Does the viewer's locale use a 12-hour clock? */
export const prefers12h = (locale?: string) =>
   /^h1[12]$/.test(new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '')

/** Lenient time input: "19:30", "7:30 pm", "730", "7pm", "19.30" → `HH:mm`, or null. */
export function parseTime(text: string): string | null {
   const t = text.trim().toLowerCase().replace(/\s+/g, '')
   const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(t)
   if (!m) return null
   let hour = Number(m[1])
   const minute = Number(m[2] ?? 0)
   const meridiem = m[3]
   if (minute > 59) return null
   if (meridiem) {
      if (hour < 1 || hour > 12) return null
      if (meridiem.startsWith('p') && hour !== 12) hour += 12
      if (meridiem.startsWith('a') && hour === 12) hour = 0
   } else if (hour > 23) return null
   return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** `HH:mm` as the viewer reads it ("19:30" or "7:30 PM"). */
export function formatTime(hhmm: string, hour12: boolean): string {
   const [h = 0, m = 0] = hhmm.split(':').map(Number)
   if (!hour12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
   const suffix = h < 12 ? 'AM' : 'PM'
   return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Every `step` minutes over a day. */
export function timeSlots(step = 15): string[] {
   const slots: string[] = []
   for (let min = 0; min < 24 * 60; min += step) {
      slots.push(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)
   }
   return slots
}
