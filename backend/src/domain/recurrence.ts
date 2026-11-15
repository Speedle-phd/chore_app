import { RRuleTemporal } from 'rrule-temporal'
import { Temporal } from 'temporal-polyfill'

/**
 * Recurrence expansion for calendar items (RFC 5545 RRULE + EXDATE, with
 * RECURRENCE-ID style overrides). Pure: no clock, no database.
 *
 * Times are stored as local wall-clock strings in the item's IANA time zone, so a
 * weekly 09:00 chore stays at 09:00 across daylight-saving changes:
 * - all-day items: `YYYY-MM-DD` (end exclusive, like iCalendar/FullCalendar),
 *   the same calendar date for every viewer;
 * - timed items: `YYYY-MM-DDTHH:mm[:ss]` in `timezone`.
 */

/** Frequencies the app offers; finer ones would explode the expansion. App choice. */
export const RRULE_FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const
/** Safety cap on instances per item and request window. */
export const MAX_INSTANCES_PER_ITEM = 1000
const SPAN_SCAN_LIMIT = 5000

export type ItemTiming = {
   allDay: boolean
   start: string
   end: string
   timezone: string
   /** RRULE body without DTSTART, e.g. `FREQ=WEEKLY;BYDAY=MO`; null = one-off. */
   rrule: string | null
   /** Original starts (same format as `start`) that are skipped. */
   exdates: string[]
   /**
    * "Repeat after completion": the next one is due this many days after the
    * current one is settled. Then `start` is the open occurrence and completed
    * ones live on as overrides with `completed` (no rule, nothing projected).
    */
   afterDays?: number | null
}

/** A stored change to one occurrence, keyed by its original start. */
export type OccurrenceOverride = {
   originalStart: string
   start?: string | null
   end?: string | null
   cancelled?: boolean
   /** Has completions; for after-completion series this marks a past occurrence. */
   completed?: boolean
}

export type Window = { from: Temporal.Instant; to: Temporal.Instant; viewerZone: string }

export type Instance = {
   /** Identifies the occurrence within its series (iCalendar RECURRENCE-ID). */
   originalStart: string
   /** All-day: `YYYY-MM-DD`; timed: ISO date-time with offset, e.g. `2026-03-30T09:00:00+02:00`. */
   start: string
   end: string
   overridden: boolean
   /**
    * Position in the series (0 = first), counting skipped dates too, so skipping
    * one doesn't shift a rotation. After-completion: number of earlier completions.
    */
   index: number
}

export function isTimeZone(zone: string): boolean {
   try {
      Temporal.ZonedDateTime.from({ year: 2000, month: 1, day: 1, timeZone: zone })
      return true
   } catch {
      return false
   }
}

/** Why a stored/entered RRULE is not acceptable, or null when it is fine. */
export function rruleProblem(rrule: string): string | null {
   if (rrule.length > 300 || /[\r\n]|DTSTART/i.test(rrule)) return 'Invalid repeat rule.'
   const freq = /(?:^|;)FREQ=([A-Z]+)/i.exec(rrule)?.[1]?.toUpperCase()
   if (!freq || !(RRULE_FREQS as readonly string[]).includes(freq)) {
      return 'Repeat daily, weekly, monthly or yearly.'
   }
   try {
      createRule(rrule, Temporal.ZonedDateTime.from('2026-01-01T09:00[UTC]'), [])
      return null
   } catch {
      return 'Invalid repeat rule.'
   }
}

/** Concrete occurrences of one item that overlap the window, sorted by start. */
export function expandItem(item: ItemTiming, overrides: OccurrenceOverride[], window: Window): Instance[] {
   const zone = ruleZone(item)
   const duration = durationOf(item)
   const byOriginal = new Map(overrides.map((o) => [o.originalStart, o]))
   const exdates = new Set(item.exdates)
   const rule = item.rrule ? createRule(item.rrule, toZoned(item, item.start, zone), item.exdates.map((d) => toZoned(item, d, zone))) : null

   const history = historyOf(item, overrides)
   const indexOf = indexer(item, history, zone)

   // Originals whose unmoved instance could touch the window; ±1 day covers all-day dates in any viewer zone.
   let originals: string[]
   if (rule) {
      const after = window.from.toZonedDateTimeISO(zone).subtract(duration).subtract({ days: 1 })
      const before = window.to.toZonedDateTimeISO(zone).add({ days: 1 })
      originals = rule
         .between(after, before, true)
         .slice(0, MAX_INSTANCES_PER_ITEM)
         .map((z) => fromZoned(item, Temporal.ZonedDateTime.from(z.toString())))
         .filter((d) => !exdates.has(d))
      indexOf.prime(after, before)
   } else {
      originals = [...history, item.start]
   }

   const instances: Instance[] = []
   const seen = new Set<string>()
   const add = (originalStart: string, override: OccurrenceOverride | undefined) => {
      seen.add(originalStart)
      if (override?.cancelled) return
      const start = override?.start ?? originalStart
      const end = override?.end ?? fromZoned(item, toZoned(item, start, zone).add(duration))
      if (!overlaps(item, start, end, window)) return
      instances.push({
         originalStart,
         start: output(item, start),
         end: output(item, end),
         overridden: Boolean(override && (override.start || override.end)),
         index: indexOf(originalStart),
      })
   }

   for (const original of originals) add(original, byOriginal.get(original))
   // Occurrences moved into the window from outside it.
   for (const override of overrides) {
      if (seen.has(override.originalStart) || !override.start) continue
      if (!isOccurrence(item, rule, override.originalStart, exdates, zone, history)) continue
      add(override.originalStart, override)
   }

   return instances.sort((a, b) => compareOutput(item, a.start, b.start))
}

/**
 * Instants that bound every occurrence (for the database range query); `to` is
 * null for open-ended series. All-day items use UTC midnight, the query pads a day.
 */
export function seriesSpan(item: ItemTiming, overrides: OccurrenceOverride[] = []): { from: Date; to: Date | null } {
   const zone = ruleZone(item)
   const duration = durationOf(item)
   const first = toZoned(item, item.start, zone)
   let last: Temporal.ZonedDateTime | null = toZoned(item, item.start, zone).add(duration)

   if (item.rrule) {
      if (!/(?:^|;)(COUNT|UNTIL)=/i.test(item.rrule)) {
         last = null
      } else {
         const rule = createRule(item.rrule, first, [])
         const all = rule.all((_, i) => i < SPAN_SCAN_LIMIT)
         const lastStart = all.length < SPAN_SCAN_LIMIT ? all.at(-1) : undefined
         last = lastStart ? Temporal.ZonedDateTime.from(lastStart.toString()).add(duration) : null
      }
   }

   let from = first.toInstant()
   let to = last?.toInstant() ?? null
   for (const o of overrides) {
      // After-completion history sits at its original date.
      const at = o.start ?? (item.afterDays && o.completed ? o.originalStart : null)
      if (o.cancelled || !at) continue
      const start = toZoned(item, at, zone)
      const end = o.end ? toZoned(item, o.end, zone) : start.add(duration)
      if (Temporal.Instant.compare(start.toInstant(), from) < 0) from = start.toInstant()
      if (to && Temporal.Instant.compare(end.toInstant(), to) > 0) to = end.toInstant()
   }
   return { from: new Date(from.epochMilliseconds), to: to ? new Date(to.epochMilliseconds) : null }
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function createRule(rrule: string, dtstart: Temporal.ZonedDateTime, exDate: Temporal.ZonedDateTime[]) {
   return new RRuleTemporal({
      rruleString: rrule,
      dtstart,
      ...(exDate.length ? { exDate } : {}),
      maxIterations: 100_000,
   })
}

/** All-day dates recur in UTC so they never shift with a zone; timed items in their own zone. */
export const ruleZone = (item: Pick<ItemTiming, 'allDay' | 'timezone'>) => (item.allDay ? 'UTC' : item.timezone)

export function toZoned(item: Pick<ItemTiming, 'allDay'>, local: string, zone: string): Temporal.ZonedDateTime {
   return item.allDay
      ? Temporal.PlainDate.from(local).toZonedDateTime({ timeZone: zone })
      : Temporal.PlainDateTime.from(local).toZonedDateTime(zone, { disambiguation: 'compatible' })
}

export function fromZoned(item: Pick<ItemTiming, 'allDay'>, zoned: Temporal.ZonedDateTime): string {
   return item.allDay
      ? zoned.toPlainDate().toString()
      : zoned.toPlainDateTime().toString({ smallestUnit: 'minute' })
}

/** Wall-clock length, so a 09:00–10:00 event stays 09:00–10:00 on every date. */
export function durationOf(item: Pick<ItemTiming, 'allDay' | 'start' | 'end'>): Temporal.Duration {
   return item.allDay
      ? Temporal.PlainDate.from(item.start).until(item.end, { largestUnit: 'day' })
      : Temporal.PlainDateTime.from(item.start).until(item.end, { largestUnit: 'day' })
}

/** Half-open overlap; a zero-length entry counts when it starts inside the window. */
function overlaps(item: ItemTiming, start: string, end: string, window: Window): boolean {
   const zone = item.allDay ? window.viewerZone : item.timezone
   const s = toZoned(item, start, zone).toInstant()
   const e = toZoned(item, end, zone).toInstant()
   const startsBeforeEnd = Temporal.Instant.compare(s, window.to) < 0
   const endsAfterStart = Temporal.Instant.compare(e, window.from) > 0
   const zeroLengthInside = s.equals(e) && Temporal.Instant.compare(s, window.from) >= 0
   return startsBeforeEnd && (endsAfterStart || zeroLengthInside)
}

export function isOccurrence(
   item: ItemTiming,
   rule: RRuleTemporal | null,
   originalStart: string,
   exdates: Set<string>,
   zone: string,
   history: string[] = [],
): boolean {
   if (exdates.has(originalStart)) return false
   if (!rule) return originalStart === item.start || history.includes(originalStart)
   return rule.matches(toZoned(item, originalStart, zone))
}

/** Completed occurrences of an after-completion series (before its open one), oldest first. */
export function historyOf(item: ItemTiming, overrides: OccurrenceOverride[]): string[] {
   if (!item.afterDays) return []
   return overrides
      .filter((o) => o.completed && o.originalStart !== item.start)
      .map((o) => o.originalStart)
      .sort()
}

/**
 * Series position of an occurrence. Rule series count every rule instance from
 * DTSTART (ignoring EXDATEs); `prime` pre-computes a window so a listing costs
 * one scan instead of one per occurrence.
 */
function indexer(item: ItemTiming, history: string[], zone: string) {
   const known = new Map<string, number>()
   const rule = item.rrule ? createRule(item.rrule, toZoned(item, item.start, zone), []) : null
   const dtstart = toZoned(item, item.start, zone)
   const countUpTo = (z: Temporal.ZonedDateTime) => rule?.between(dtstart, z, true).length ?? 0
   const indexOf = (original: string): number => {
      const cached = known.get(original)
      if (cached !== undefined) return cached
      if (!rule) return item.afterDays ? history.filter((h) => h < original).length : 0
      return Math.max(0, countUpTo(toZoned(item, original, zone)) - 1)
   }
   indexOf.prime = (after: Temporal.ZonedDateTime, before: Temporal.ZonedDateTime) => {
      if (!rule) return
      const inWindow = rule.between(after, before, true).slice(0, MAX_INSTANCES_PER_ITEM)
      const first = inWindow[0]
      if (!first) return
      const base = countUpTo(Temporal.ZonedDateTime.from(first.toString())) - 1
      inWindow.forEach((z, i) => known.set(fromZoned(item, Temporal.ZonedDateTime.from(z.toString())), base + i))
   }
   return indexOf
}

function output(item: ItemTiming, local: string): string {
   if (item.allDay) return local
   return toZoned(item, local, item.timezone).toString({ timeZoneName: 'never', smallestUnit: 'second' })
}

function compareOutput(item: ItemTiming, a: string, b: string): number {
   return item.allDay
      ? Temporal.PlainDate.compare(a, b)
      : Temporal.Instant.compare(Temporal.Instant.from(a), Temporal.Instant.from(b))
}

/** Series position of one occurrence (see `Instance.index`). */
export function seriesIndex(item: ItemTiming, overrides: OccurrenceOverride[], originalStart: string): number {
   return indexer(item, historyOf(item, overrides), ruleZone(item))(originalStart)
}
