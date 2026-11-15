import { Temporal } from 'temporal-polyfill'
import { createRule, ruleZone, toZoned, type ItemTiming } from './recurrence'

/**
 * Pure edits of a repeating series: converting incoming times to the item's
 * local format, shifting, and splitting at an occurrence ("this and following").
 */

type Timing = Pick<ItemTiming, 'allDay' | 'timezone'>

const DATE = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** Canonical local form: `YYYY-MM-DD` (all-day) or `YYYY-MM-DDTHH:mm`; null if invalid. */
export function normalizeLocal(allDay: boolean, value: string): string | null {
   try {
      if (allDay) return DATE.test(value) ? Temporal.PlainDate.from(value).toString() : null
      if (!LOCAL_DATE_TIME.test(value)) return null
      return Temporal.PlainDateTime.from(value).toString({ smallestUnit: 'minute' })
   } catch {
      return null
   }
}

/**
 * An incoming moved time (all-day: `YYYY-MM-DD`; timed: ISO date-time with offset,
 * as the calendar reports drops) in the item's local format; null when it
 * doesn't fit the item (e.g. a time for an all-day item).
 */
export function toItemLocal(item: Timing, value: string): string | null {
   if (item.allDay) return normalizeLocal(true, value)
   if (DATE.test(value)) return null
   try {
      const instant = Temporal.Instant.from(value)
      return instant.toZonedDateTimeISO(item.timezone).toPlainDateTime().toString({ smallestUnit: 'minute' })
   } catch {
      return null
   }
}

/** Wall-clock difference from `a` to `b` (days + time). */
export function localDelta(allDay: boolean, a: string, b: string): Temporal.Duration {
   return allDay
      ? Temporal.PlainDate.from(a).until(b, { largestUnit: 'day' })
      : Temporal.PlainDateTime.from(a).until(b, { largestUnit: 'day' })
}

export function shiftLocal(allDay: boolean, local: string, delta: Temporal.Duration): string {
   return allDay
      ? Temporal.PlainDate.from(local).add(delta).toString()
      : Temporal.PlainDateTime.from(local).add(delta).toString({ smallestUnit: 'minute' })
}

export function compareLocal(allDay: boolean, a: string, b: string): number {
   return allDay ? Temporal.PlainDate.compare(a, b) : Temporal.PlainDateTime.compare(a, b)
}

/** Rules that pin occurrences to particular days; moving their dates needs the repeat editor. */
export function hasDayRules(rrule: string): boolean {
   return /(?:^|;)(BYDAY|BYMONTHDAY|BYYEARDAY|BYWEEKNO|BYMONTH|BYSETPOS)=/i.test(rrule)
}

type RuleParts = Map<string, string>
const parse = (rrule: string): RuleParts =>
   new Map(
      rrule
         .split(';')
         .filter(Boolean)
         .map((part) => {
            const [key = '', value = ''] = part.split('=')
            return [key.toUpperCase(), value]
         }),
   )
const serialize = (parts: RuleParts) => [...parts].map(([k, v]) => `${k}=${v}`).join(';')

/** UNTIL in UTC (RFC 5545 requires UTC when DTSTART has a zone). */
const untilValue = (zoned: Temporal.ZonedDateTime) =>
   zoned.toInstant().toString({ smallestUnit: 'second' }).replace(/[-:]/g, '')

/**
 * Splits a series at `originalStart` ("this and following").
 * - `beforeRrule`: the original series ending with the last occurrence before the split,
 *   or null when nothing comes before (the whole series is affected).
 * - `afterRrule`: the rule for a new series starting at the split; COUNT is reduced
 *   by the occurrences that stay in the first part.
 */
export function splitSeries(
   item: ItemTiming & { rrule: string },
   originalStart: string,
): { beforeRrule: string | null; afterRrule: string } {
   const zone = ruleZone(item)
   const dtstart = toZoned(item, item.start, zone)
   const split = toZoned(item, originalStart, zone)
   const rule = createRule(item.rrule, dtstart, [])
   // EXDATEs don't change COUNT (RFC 5545 §3.8.5.1), so count rule instances without them.
   const before = rule
      .between(dtstart, split, true)
      .map((z) => Temporal.ZonedDateTime.from(z.toString()))
      .filter((z) => Temporal.ZonedDateTime.compare(z, split) < 0)

   const parts = parse(item.rrule)
   const after = new Map(parts)
   const count = parts.get('COUNT')
   if (count) after.set('COUNT', String(Math.max(1, Number(count) - before.length)))

   const last = before.at(-1)
   if (!last) return { beforeRrule: null, afterRrule: serialize(after) }
   const head = new Map(parts)
   head.delete('COUNT')
   head.set('UNTIL', untilValue(last))
   return { beforeRrule: serialize(head), afterRrule: serialize(after) }
}

