import { Temporal } from 'temporal-polyfill'

/**
 * The daily reminder digest (user decisions, 2026-11-16): one e-mail per person
 * per day, at 08:00 in their time zone; days that were missed are dropped.
 */
export const DIGEST_HOUR = 8
/** Attempts per person and day before giving up (mailer down, …). App choice. */
export const MAX_DIGEST_ATTEMPTS = 3
/** Used until we know someone's zone (it's saved on their next visit). App choice. */
export const FALLBACK_TIME_ZONE = 'Europe/Berlin'

/** Today's local date if it's digest time for this zone (08:00 or later), else null. */
export function digestDate(now: Temporal.Instant, timeZone: string): string | null {
   const local = now.toZonedDateTimeISO(timeZone)
   return local.hour >= DIGEST_HOUR ? local.toPlainDate().toString() : null
}

export type DigestReminder = {
   household: string
   title: string
   kind: string
   date: string
   leadDays: number
   allDay: boolean
   start: string
   age: number | null
}

export type DigestLine = { title: string; when: string }
export type DigestGroup = { household: string; today: DigestLine[]; soon: DigestLine[] }

const dateLabel = (date: string, locale: string) =>
   Temporal.PlainDate.from(date).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * E-mail sections per household: "Today" and "Coming up" (with how far ahead).
 * Times are shown in the person's zone; all-day entries show no time.
 */
export function digestGroups(reminders: DigestReminder[], timeZone: string, locale = 'en-GB'): DigestGroup[] {
   const groups = new Map<string, DigestGroup>()
   const sorted = [...reminders].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
   for (const r of sorted) {
      const group = groups.get(r.household) ?? { household: r.household, today: [], soon: [] }
      groups.set(r.household, group)
      const title = r.age !== null && !r.title.includes(String(r.age)) ? `${r.title} (${r.age})` : r.title
      const time = r.allDay
         ? ''
         : Temporal.Instant.from(r.start).toZonedDateTimeISO(timeZone).toPlainTime().toString({ smallestUnit: 'minute' })
      if (r.leadDays === 0) {
         group.today.push({ title, when: time || 'all day' })
      } else {
         const ahead = r.leadDays === 1 ? 'tomorrow' : `in ${r.leadDays} days`
         group.soon.push({ title, when: `${ahead}, ${dateLabel(r.date, locale)}${time ? ` at ${time}` : ''}` })
      }
   }
   return [...groups.values()]
}
