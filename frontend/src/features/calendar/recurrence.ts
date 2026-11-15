import { Temporal } from 'temporal-polyfill'

/**
 * What the repeat editor can show, and its mapping to an RFC 5545 RRULE body
 * (the server validates and expands it; see backend/src/domain/recurrence.ts).
 */

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export type Weekday = (typeof WEEKDAYS)[number]
export const WEEKDAY_LABEL: Record<Weekday, { short: string; long: string }> = {
   MO: { short: 'Mon', long: 'Monday' },
   TU: { short: 'Tue', long: 'Tuesday' },
   WE: { short: 'Wed', long: 'Wednesday' },
   TH: { short: 'Thu', long: 'Thursday' },
   FR: { short: 'Fri', long: 'Friday' },
   SA: { short: 'Sat', long: 'Saturday' },
   SU: { short: 'Sun', long: 'Sunday' },
}

export const FREQS = ['none', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const
/** `AFTER` = chores only: the next one is due `interval` days after it was done (no RRULE). */
export type Freq = (typeof FREQS)[number] | 'AFTER'

export type RepeatEnd = { type: 'never' } | { type: 'until'; date: string } | { type: 'count'; count: number }

export type Repeat = {
   freq: Freq
   interval: number
   /** Weekly only; empty = the start's weekday. */
   byDay: Weekday[]
   end: RepeatEnd
}

export const NO_REPEAT: Repeat = { freq: 'none', interval: 1, byDay: [], end: { type: 'never' } }

/** ISO weekday (1 = Monday) of a `YYYY-MM-DD…` local start. */
export const weekdayOf = (localStart: string): Weekday =>
   WEEKDAYS[Temporal.PlainDate.from(localStart.slice(0, 10)).dayOfWeek - 1] ?? 'MO'

/**
 * RRULE body for the editor state, or null for "does not repeat".
 * UNTIL is the end of the chosen day in the entry's zone, in UTC (RFC 5545 §3.3.10).
 */
export function toRrule(repeat: Repeat, timezone: string): string | null {
   if (repeat.freq === 'none' || repeat.freq === 'AFTER') return null
   const parts = [`FREQ=${repeat.freq}`]
   if (repeat.interval > 1) parts.push(`INTERVAL=${repeat.interval}`)
   if (repeat.freq === 'WEEKLY' && repeat.byDay.length) {
      parts.push(`BYDAY=${WEEKDAYS.filter((d) => repeat.byDay.includes(d)).join(',')}`)
   }
   if (repeat.end.type === 'count') parts.push(`COUNT=${repeat.end.count}`)
   if (repeat.end.type === 'until') {
      const endOfDay = Temporal.PlainDate.from(repeat.end.date)
         .add({ days: 1 })
         .toZonedDateTime({ timeZone: timezone })
         .subtract({ seconds: 1 })
      parts.push(`UNTIL=${endOfDay.toInstant().toString({ smallestUnit: 'second' }).replace(/[-:]/g, '')}`)
   }
   return parts.join(';')
}

/**
 * Editor state for a stored rule, or 'custom' when it uses parts the editor
 * can't show (it is then kept unchanged unless the user picks something else).
 */
export function fromRrule(rrule: string | null, timezone: string): Repeat | 'custom' {
   if (!rrule) return NO_REPEAT
   const parts = new Map(
      rrule.split(';').map((p) => {
         const [k = '', v = ''] = p.split('=')
         return [k.toUpperCase(), v.toUpperCase()]
      }),
   )
   const freq = parts.get('FREQ')
   if (!freq || !(FREQS as readonly string[]).includes(freq) || freq === 'none') return 'custom'
   const known = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', ...(freq === 'WEEKLY' ? ['BYDAY', 'WKST'] : [])])
   if ([...parts.keys()].some((k) => !known.has(k))) return 'custom'

   const byDay = (parts.get('BYDAY') ?? '').split(',').filter(Boolean)
   if (!byDay.every((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d))) return 'custom'
   const interval = Number(parts.get('INTERVAL') ?? 1)
   const count = parts.get('COUNT')
   const until = parts.get('UNTIL')

   let end: RepeatEnd = { type: 'never' }
   if (count) end = { type: 'count', count: Number(count) }
   if (until) {
      const date = untilDate(until, timezone)
      if (!date) return 'custom'
      end = { type: 'until', date }
   }
   return { freq: freq as Freq, interval: Number.isInteger(interval) && interval > 0 ? interval : 1, byDay, end }
}

function untilDate(until: string, timezone: string): string | null {
   const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(until)
   if (!m) return null
   const [, y, mo, d, h, mi, s] = m
   if (!h) return `${y}-${mo}-${d}`
   return Temporal.Instant.from(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toZonedDateTimeISO(timezone).toPlainDate().toString()
}

/** Days for "repeat after completion", or null. */
export const afterDaysOf = (repeat: Repeat | 'custom') =>
   repeat !== 'custom' && repeat.freq === 'AFTER' ? repeat.interval : null

/** Editor state for a stored entry (fixed rule or after completion). */
export function repeatOf(rrule: string | null, afterDays: number | null, timezone: string): Repeat | 'custom' {
   if (afterDays) return { ...NO_REPEAT, freq: 'AFTER', interval: afterDays }
   return fromRrule(rrule, timezone)
}

const UNIT: Record<Exclude<Freq, 'none' | 'AFTER'>, [string, string]> = {
   DAILY: ['day', 'days'],
   WEEKLY: ['week', 'weeks'],
   MONTHLY: ['month', 'months'],
   YEARLY: ['year', 'years'],
}

const formatDate = (date: string) =>
   new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Short human description, e.g. "Every 2 weeks on Mon, Thu, 5 times". */
export function describeRepeat(rrule: string | null, timezone: string, afterDays: number | null = null): string {
   const repeat = repeatOf(rrule, afterDays, timezone)
   if (repeat === 'custom') return 'Custom repeat'
   if (repeat.freq === 'none') return 'Does not repeat'
   if (repeat.freq === 'AFTER') {
      return `${repeat.interval === 1 ? 'The day' : `${repeat.interval} days`} after it’s done`
   }
   const [one, many] = UNIT[repeat.freq]
   let text = repeat.interval > 1 ? `Every ${repeat.interval} ${many}` : `Every ${one}`
   if (repeat.byDay.length) text += ` on ${repeat.byDay.map((d) => WEEKDAY_LABEL[d].short).join(', ')}`
   if (repeat.end.type === 'count') text += `, ${repeat.end.count} ${repeat.end.count === 1 ? 'time' : 'times'}`
   if (repeat.end.type === 'until') text += `, until ${formatDate(repeat.end.date)}`
   return text
}
