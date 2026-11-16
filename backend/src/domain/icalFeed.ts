import ical from 'ical-generator'
import { Temporal } from 'temporal-polyfill'

/**
 * The subscribe feed (RFC 5545): every occurrence in the window as its own
 * VEVENT, so rotation, reassignments, "repeat after completion" and member
 * birthdays come out exactly as the app shows them. UIDs are stable per
 * occurrence (entry + original start), so a moved occurrence updates in place.
 */

/** Feed window around today. App choice. */
export const FEED_PAST_DAYS = 90
export const FEED_FUTURE_DAYS = 365
/** How often calendar apps should refetch (REFRESH-INTERVAL / X-PUBLISHED-TTL). */
const FEED_TTL_SECONDS = 3600

const KIND_LABELS = { chore: 'Chore', event: 'Event', birthday: 'Birthday', vacation: 'Vacation', meal: 'Meal' } as const

export type FeedInstance = {
   id: string
   kind: keyof typeof KIND_LABELS
   title: string
   notes: string
   allDay: boolean
   /** All-day: `YYYY-MM-DD` (end exclusive); timed: ISO date-time with offset. */
   start: string
   end: string
   memberIds: string[]
   chore: { state: string } | null
}

export type FeedInput = {
   name: string
   instances: FeedInstance[]
   /** Membership id → display name. */
   names: Map<string, string>
   now: Date
   /** Link back to the app's calendar. */
   calendarUrl: string
}

export function buildFeed({ name, instances, names, now, calendarUrl }: FeedInput): string {
   const calendar = ical({
      name,
      prodId: { company: 'Hearth', product: 'Hearth calendar', language: 'EN' },
      ttl: FEED_TTL_SECONDS,
   })
   for (const i of instances) {
      const people = i.memberIds.flatMap((id) => names.get(id) ?? [])
      const done = i.chore?.state === 'done'
      const description = [
         done ? 'Done.' : i.chore?.state === 'skipped' ? 'Skipped.' : '',
         people.length ? `${i.kind === 'chore' ? 'For' : 'With'}: ${people.join(', ')}` : '',
         i.notes,
      ]
         .filter(Boolean)
         .join('\n\n')
      calendar.createEvent({
         id: `${i.id}@hearth`,
         stamp: now,
         start: i.allDay ? Temporal.PlainDate.from(i.start) : Temporal.Instant.from(i.start),
         end: i.allDay ? Temporal.PlainDate.from(i.end) : Temporal.Instant.from(i.end),
         allDay: i.allDay,
         summary: done ? `✓ ${i.title}` : i.title,
         description: description || null,
         categories: [{ name: KIND_LABELS[i.kind] }],
         url: calendarUrl,
      })
   }
   return calendar.toString()
}
