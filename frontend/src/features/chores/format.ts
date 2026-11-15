import { Temporal } from 'temporal-polyfill'
import type { CalendarInstance } from '@/features/calendar/calendarApi'

/** Local date (`YYYY-MM-DD`) an occurrence starts on for the viewer. */
export function dateOf(instance: Pick<CalendarInstance, 'allDay' | 'start'>, zone: string): string {
   return instance.allDay
      ? instance.start
      : Temporal.Instant.from(instance.start).toZonedDateTimeISO(zone).toPlainDate().toString()
}

/** "Today", "Tomorrow", "Yesterday", or e.g. "Mon 23 Mar". */
export function dayLabel(date: string, today: string, locale?: string): string {
   const diff = Temporal.PlainDate.from(today).until(date, { largestUnit: 'day' }).days
   if (diff === 0) return 'Today'
   if (diff === 1) return 'Tomorrow'
   if (diff === -1) return 'Yesterday'
   return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Today · 19:00", "Mon 23 Mar · all day". */
export function whenText(instance: Pick<CalendarInstance, 'allDay' | 'start'>, today: string, zone: string, locale?: string): string {
   const day = dayLabel(dateOf(instance, zone), today, locale)
   if (instance.allDay) return `${day} · all day`
   const time = new Date(instance.start).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: zone })
   return `${day} · ${time}`
}

/** Is it mine to do? Assigned to me, or to nobody (anyone may). */
export const isMine = (instance: Pick<CalendarInstance, 'memberIds'>, myId: string | undefined) =>
   instance.memberIds.length === 0 || (myId !== undefined && instance.memberIds.includes(myId))
