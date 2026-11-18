import type { ChatMessage } from './chatApi'

/** Messages by the same person closer together than this share one name/avatar. App choice. */
const GROUP_GAP_MS = 5 * 60_000

export type ChatRow = { message: ChatMessage; /** First of a run by the same person: show name and avatar. */ first: boolean }
export type ChatDay = { key: string; label: string; rows: ChatRow[] }

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

export function dayLabel(iso: string, now: Date): string {
   const d = new Date(iso)
   const yesterday = new Date(now)
   yesterday.setDate(now.getDate() - 1)
   if (localDay(d) === localDay(now)) return 'Today'
   if (localDay(d) === localDay(yesterday)) return 'Yesterday'
   return d.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
   })
}

/** Messages (oldest first) by local day, each run of one person's messages marked at its start. */
export function groupMessages(messages: readonly ChatMessage[], now: Date): ChatDay[] {
   const days: ChatDay[] = []
   let previous: ChatMessage | undefined
   for (const message of messages) {
      const key = localDay(new Date(message.createdAt))
      let day = days[days.length - 1]
      if (!day || day.key !== key) {
         day = { key, label: dayLabel(message.createdAt, now), rows: [] }
         days.push(day)
         previous = undefined
      }
      const first =
         !previous ||
         previous.authorId !== message.authorId ||
         Date.parse(message.createdAt) - Date.parse(previous.createdAt) > GROUP_GAP_MS
      day.rows.push({ message, first })
      previous = message
   }
   return days
}
