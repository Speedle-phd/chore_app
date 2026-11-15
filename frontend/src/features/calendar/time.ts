import { Temporal } from 'temporal-polyfill'

/** The viewer's zone decides which day an all-day entry covers on screen. */
export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Date and time inputs' values (`YYYY-MM-DD`, `HH:mm`). */
export type LocalParts = { date: string; time: string }

/** A local `YYYY-MM-DD[THH:mm]` string split into input values. */
export const splitLocal = (local: string): LocalParts => ({ date: local.slice(0, 10), time: local.slice(11, 16) || '09:00' })
export const joinLocal = ({ date, time }: LocalParts, allDay: boolean) => (allDay ? date : `${date}T${time}`)

/** An instant (ISO with offset, as the calendar lists it) as input values in `zone`. */
export function instantToParts(iso: string, zone: string): LocalParts {
   const zoned = Temporal.Instant.from(iso).toZonedDateTimeISO(zone)
   return { date: zoned.toPlainDate().toString(), time: zoned.toPlainTime().toString({ smallestUnit: 'minute' }) }
}

/** Input values in `zone` as an ISO date-time with offset, e.g. `2026-11-20T20:00:00+01:00`. */
export function partsToInstant({ date, time }: LocalParts, zone: string): string {
   return Temporal.PlainDateTime.from(`${date}T${time}`)
      .toZonedDateTime(zone)
      .toString({ timeZoneName: 'never', smallestUnit: 'second' })
}

export const addDays = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString()

/** The next full hour from `now` in `zone`, one hour long. */
export function nextHourSlot(now: Temporal.Instant, zone: string): { start: LocalParts; end: LocalParts } {
   const start = now.toZonedDateTimeISO(zone).round({ smallestUnit: 'hour', roundingMode: 'ceil' })
   const end = start.add({ hours: 1 })
   const parts = (z: Temporal.ZonedDateTime) => ({
      date: z.toPlainDate().toString(),
      time: z.toPlainTime().toString({ smallestUnit: 'minute' }),
   })
   return { start: parts(start), end: parts(end) }
}

/** "Mon 16 Nov, 19:00 – 19:15" / "Tue 24 – Fri 27 Nov" for an occurrence in the viewer's locale. */
export function formatWhen(start: string, end: string, allDay: boolean): string {
   if (allDay) {
      const first = new Date(`${start}T12:00:00`)
      const last = new Date(`${addDays(end, -1)}T12:00:00`)
      const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
      return start === addDays(end, -1) ? `${fmt.format(first)} · all day` : fmt.formatRange(first, last)
   }
   const fmt = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
   })
   return fmt.formatRange(new Date(start), new Date(end))
}
