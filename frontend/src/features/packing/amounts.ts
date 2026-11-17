import { Temporal } from 'temporal-polyfill'

/** Mirrors backend/src/domain/packing.ts (the server validates). */
export const MAX_AMOUNT = 99
export const MAX_TRIP_DAYS = 365

/**
 * Typed amount → number. Empty = none (null); undefined = not valid.
 * Fixed amounts and list amounts are whole numbers; per day also takes halves
 * ("0,5", "½", "1½").
 */
export function parseAmount(text: string, { halves = false } = {}): number | null | undefined {
   const t = text.trim().replace(',', '.').replace(/^(\d*)\s*½$/, (_m, whole: string) => String(Number(whole || 0) + 0.5))
   if (!t) return null
   if (!/^\d+(\.\d+)?$/.test(t)) return undefined
   const n = Number(t)
   if (n <= 0 || n > MAX_AMOUNT) return undefined
   return Number.isInteger(halves ? n * 2 : n) ? n : undefined
}

/** 0.5 → "½", 1.5 → "1½", 3 → "3". */
export function formatAmount(n: number): string {
   const whole = Math.floor(n)
   return n - whole === 0.5 ? `${whole || ''}½` : String(n)
}

/** A template item's amount in words: "2", "1 a day, at most 7", "" for none. */
export function describeAmount(item: { amount: number | null; perDay: boolean; maxAmount: number | null }): string {
   if (item.amount === null) return ''
   if (!item.perDay) return formatAmount(item.amount)
   return `${formatAmount(item.amount)} a day${item.maxAmount ? `, at most ${item.maxAmount}` : ''}`
}

/**
 * Days of a trip from a calendar entry: all-day entries end the day after (10–14 Dec
 * = 4 days); timed ones count every day they touch in the viewer's zone (Fri evening
 * to Sun = 3 days). Null when it can't be told.
 */
export function tripDaysOf(entry: { allDay: boolean; start: string; end: string }, timeZone: string): number | null {
   try {
      const days = entry.allDay
         ? Temporal.PlainDate.from(entry.start.slice(0, 10)).until(Temporal.PlainDate.from(entry.end.slice(0, 10))).days
         : Temporal.Instant.from(entry.start)
              .toZonedDateTimeISO(timeZone)
              .toPlainDate()
              .until(Temporal.Instant.from(entry.end).toZonedDateTimeISO(timeZone).toPlainDate()).days + 1
      return days >= 1 ? Math.min(days, MAX_TRIP_DAYS) : null
   } catch {
      // Not a date range we can read: the person types the days instead.
      return null
   }
}
