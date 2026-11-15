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

/**
 * Wording for a vacation clash: "Ada is away" and the button for the suggestion.
 * If everyone suggested is already assigned, the away people are left out
 * ("each of them"); otherwise someone takes over.
 */
export function conflictText(
   conflict: { away: string[]; suggestion: string[] | null },
   assignees: string[],
   people: { id: string; fname: string }[],
): { awayText: string; action: string | null } {
   const names = (ids: string[]) => ids.map((id) => people.find((p) => p.id === id)?.fname ?? 'Former member').join(' and ')
   const awayText = `${names(conflict.away)} ${conflict.away.length > 1 ? 'are' : 'is'} away`
   if (!conflict.suggestion?.length) return { awayText, action: null }
   const leaveOut = conflict.suggestion.every((id) => assignees.includes(id))
   return { awayText, action: leaveOut ? `Leave ${names(conflict.away)} out` : `Give to ${names(conflict.suggestion)}` }
}
