import { Temporal } from 'temporal-polyfill'

/**
 * Member birthdays. Stored as `YYYY-MM-DD`, or `--MM-DD` when the year is unknown
 * (the vCard convention, RFC 6350 §4.3.1). A 29 February birthday is shown on
 * 28 February in non-leap years (app choice).
 */

export type Birthday = { month: number; day: number; year: number | null }

const FULL = /^(\d{4})-(\d{2})-(\d{2})$/
const NO_YEAR = /^--(\d{2})-(\d{2})$/

export function parseBirthday(value: string | null | undefined): Birthday | null {
   if (!value) return null
   const full = FULL.exec(value)
   const noYear = full ? null : NO_YEAR.exec(value)
   if (!full && !noYear) return null
   const year = full ? Number(full[1]) : null
   const month = Number(full ? full[2] : noYear?.[1])
   const day = Number(full ? full[3] : noYear?.[2])
   try {
      // Without a year, check against a leap year so 29 February is allowed.
      Temporal.PlainDate.from({ year: year ?? 2000, month, day }, { overflow: 'reject' })
   } catch {
      return null
   }
   return { month, day, year }
}

/** Canonical stored form, or null when invalid (also: in the future relative to `today`). */
export function normalizeBirthday(value: string, today: string): string | null {
   const b = parseBirthday(value)
   if (!b) return null
   if (b.year === null) return `--${pad(b.month)}-${pad(b.day)}`
   const date = Temporal.PlainDate.from({ year: b.year, month: b.month, day: b.day })
   if (Temporal.PlainDate.compare(date, today) > 0 || b.year < 1900) return null
   return date.toString()
}

/** The birthday's date in a given year (29 Feb → 28 Feb in non-leap years). */
export function birthdayIn(b: Birthday, year: number): Temporal.PlainDate {
   return Temporal.PlainDate.from({ year, month: b.month, day: b.day }, { overflow: 'constrain' })
}

/** Birthdays with dates in [from, to) and the age reached (null when the year is unknown). */
export function birthdaysBetween(b: Birthday, from: string, to: string): { date: string; age: number | null }[] {
   const start = Temporal.PlainDate.from(from)
   const end = Temporal.PlainDate.from(to)
   const result: { date: string; age: number | null }[] = []
   for (let year = start.year; year <= end.year; year++) {
      if (b.year !== null && year < b.year) continue
      const date = birthdayIn(b, year)
      if (Temporal.PlainDate.compare(date, start) < 0 || Temporal.PlainDate.compare(date, end) >= 0) continue
      result.push({ date: date.toString(), age: b.year === null ? null : year - b.year })
   }
   return result
}

const pad = (n: number) => String(n).padStart(2, '0')
