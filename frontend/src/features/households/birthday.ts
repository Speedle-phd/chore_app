/**
 * Birthdays as the server stores them: `YYYY-MM-DD`, or `--MM-DD` when the year
 * is unknown (see backend/src/domain/birthdays.ts). The form edits day/month/year.
 */

export type BirthdayParts = { day: string; month: string; year: string }

export const EMPTY_BIRTHDAY: BirthdayParts = { day: '', month: '', year: '' }

export function toParts(value: string | null | undefined): BirthdayParts {
   const m = /^(\d{4}|-)-?(\d{2})-(\d{2})$/.exec(value ?? '')
   if (!m) return EMPTY_BIRTHDAY
   return { year: m[1] === '-' ? '' : (m[1] ?? ''), month: String(Number(m[2])), day: String(Number(m[3])) }
}

/** Stored form, '' for "no birthday", or null when incomplete/invalid. */
export function fromParts({ day, month, year }: BirthdayParts): string | null {
   if (!day && !month && !year) return ''
   const d = Number(day)
   const mo = Number(month)
   if (!Number.isInteger(d) || !Number.isInteger(mo) || mo < 1 || mo > 12 || d < 1) return null
   const y = year ? Number(year) : null
   if (year && (!Number.isInteger(y) || (y as number) < 1900)) return null
   // Days per month; without a year, 29 February is allowed.
   const daysIn = new Date(Date.UTC(y ?? 2000, mo, 0)).getUTCDate()
   if (d > daysIn) return null
   const mm = String(mo).padStart(2, '0')
   const dd = String(d).padStart(2, '0')
   return y ? `${y}-${mm}-${dd}` : `--${mm}-${dd}`
}

/** "12 May 1990" / "24 Dec" in the viewer's locale. */
export function formatBirthday(value: string | null | undefined, locale?: string): string | null {
   const parts = toParts(value)
   if (!parts.day) return null
   const date = new Date(Date.UTC(Number(parts.year || 2000), Number(parts.month) - 1, Number(parts.day), 12))
   return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      ...(parts.year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
   })
}
