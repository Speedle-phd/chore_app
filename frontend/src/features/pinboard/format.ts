import type { ExpiryPreset, Post } from './pinboardApi'

export const EXPIRY_OPTIONS: { value: ExpiryPreset; label: string }[] = [
   { value: 'day', label: 'a day' },
   { value: '3days', label: '3 days' },
   { value: 'week', label: 'a week' },
   { value: 'month', label: 'a month' },
   { value: 'never', label: 'until removed' },
]

const MIN = 60_000
const HOUR = 60 * MIN

/** "just now", "5 min ago", "3 h ago", "yesterday", else the date. */
export function relativeTime(iso: string, now: Date): string {
   const then = new Date(iso)
   const diff = now.getTime() - then.getTime()
   if (diff < MIN) return 'just now'
   if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`
   if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)} h ago`
   if (diff < 48 * HOUR) return 'yesterday'
   return shortDate(iso, now)
}

/** "Mon, 24 Nov" (with the year when it isn't this year). */
export function shortDate(iso: string, now: Date): string {
   const d = new Date(iso)
   return d.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
   })
}

export type TextPart = { kind: 'text'; value: string } | { kind: 'link'; value: string }

/** Plain text with http(s) links as separate parts (no HTML ever); trailing punctuation stays text. */
export function linkify(text: string): TextPart[] {
   const parts: TextPart[] = []
   let last = 0
   for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
      let url = m[0]
      const trailing = /[.,;:!?)\]'’]+$/.exec(url)?.[0] ?? ''
      url = url.slice(0, url.length - trailing.length)
      const start = m.index
      if (start > last) parts.push({ kind: 'text', value: text.slice(last, start) })
      parts.push({ kind: 'link', value: url })
      last = start + url.length
   }
   if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
   return parts
}

/** Something new by someone else since this device last looked at the board. */
export const hasUnread = (posts: readonly Pick<Post, 'createdAt' | 'authorId'>[], seenAt: string | null, meId: string | undefined) =>
   posts.some((p) => p.authorId !== meId && (seenAt === null || p.createdAt > seenAt))

export const seenKey = (householdId: string) => `pinboard-seen-${householdId}`
