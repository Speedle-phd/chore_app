import { Temporal } from 'temporal-polyfill'
import type { AssignmentMode, ChoreState, CompletionStatus } from './chores'

/**
 * Chore statistics, points, streaks and badges. Pure: rows in, numbers out.
 * App choices (see docs/HANDOFF.md):
 * - points = the chore's effort (1–5) per done chore; "any one of them" credits only
 *   the first person who did it, "each of them" credits every assignee who did their part;
 *   skipped earns nothing;
 * - on time = done before the occurrence's end; missed = not settled after its end;
 * - fair share = equal split among the people who had chores in the period;
 * - a streak = consecutive days with at least one done chore (current: ending today or yesterday).
 */

export type StatsRow = {
   itemId: string
   title: string
   effort: number
   mode: AssignmentMode
   /** Local date of the occurrence. */
   date: string
   /** End of the occurrence (epoch ms). */
   due: number
   assignees: string[]
   state: ChoreState
   overdue: boolean
   completions: { memberId: string; status: CompletionStatus; at: number }[]
}

export type MemberStats = {
   memberId: string
   points: number
   done: number
   onTime: number
   skipped: number
   assigned: number
   missed: number
}

/** Done completions that earn points, with who and when. */
export function creditedCompletions(row: StatsRow) {
   const done = row.completions.filter((c) => c.status === 'done').sort((a, b) => a.at - b.at)
   if (row.mode === 'everyone' && row.assignees.length) return done.filter((c) => row.assignees.includes(c.memberId))
   return done.slice(0, 1)
}

const empty = (memberId: string): MemberStats => ({ memberId, points: 0, done: 0, onTime: 0, skipped: 0, assigned: 0, missed: 0 })

export function memberStats(rows: StatsRow[], memberIds: string[]): MemberStats[] {
   const byId = new Map(memberIds.map((id) => [id, empty(id)]))
   const get = (id: string) => byId.get(id)
   for (const row of rows) {
      for (const id of row.assignees) {
         const m = get(id)
         if (!m) continue
         m.assigned++
         if (row.overdue && !row.completions.some((c) => c.memberId === id)) m.missed++
      }
      for (const c of creditedCompletions(row)) {
         const m = get(c.memberId)
         if (!m) continue
         m.done++
         m.points += row.effort
         if (c.at <= row.due) m.onTime++
      }
      for (const c of row.completions) {
         const m = c.status === 'skipped' ? get(c.memberId) : undefined
         if (m) m.skipped++
      }
   }
   return [...byId.values()]
}

/** Equal share among people who had chores (assigned or did one) in the period; null if nobody. */
export function fairShare(stats: MemberStats[]): number | null {
   const active = stats.filter((m) => m.assigned > 0 || m.done > 0).length
   return active ? 1 / active : null
}

export function totals(rows: StatsRow[]) {
   let done = 0
   let onTime = 0
   let points = 0
   let skipped = 0
   let missed = 0
   for (const row of rows) {
      const credited = creditedCompletions(row)
      done += credited.length
      onTime += credited.filter((c) => c.at <= row.due).length
      points += credited.length * row.effort
      if (row.state === 'skipped') skipped++
      if (row.overdue) missed++
   }
   return { done, onTime, points, skipped, missed, onTimeRate: done ? onTime / done : null }
}

export function choreStats(rows: StatsRow[]) {
   const byItem = new Map<string, { itemId: string; title: string; done: number; skipped: number; missed: number; doers: Map<string, number> }>()
   for (const row of rows) {
      const s = byItem.get(row.itemId) ?? { itemId: row.itemId, title: row.title, done: 0, skipped: 0, missed: 0, doers: new Map() }
      byItem.set(row.itemId, s)
      const credited = creditedCompletions(row)
      s.done += credited.length
      if (row.state === 'skipped') s.skipped++
      if (row.overdue) s.missed++
      for (const c of credited) s.doers.set(c.memberId, (s.doers.get(c.memberId) ?? 0) + 1)
   }
   return [...byItem.values()]
      .map(({ doers, ...s }) => ({
         ...s,
         // Most done by; ties: whoever got there first in the list.
         topMemberId: [...doers].reduce<[string, number] | null>((best, d) => (!best || d[1] > best[1] ? d : best), null)?.[0] ?? null,
      }))
      .sort((a, b) => b.done - a.done || a.title.localeCompare(b.title))
}

/** Points and done chores per bucket (day, or Monday-based week), by completion date. */
export function activitySeries(rows: StatsRow[], from: string, to: string, tz: string, bucket: 'day' | 'week') {
   const keyOf = (date: Temporal.PlainDate) => (bucket === 'day' ? date : date.subtract({ days: date.dayOfWeek - 1 })).toString()
   const series = new Map<string, { date: string; points: number; done: number }>()
   for (let d = Temporal.PlainDate.from(from); Temporal.PlainDate.compare(d, to) < 0; d = d.add({ days: bucket === 'day' ? 1 : 7 })) {
      const key = keyOf(d)
      series.set(key, { date: key, points: 0, done: 0 })
   }
   for (const row of rows) {
      for (const c of creditedCompletions(row)) {
         const day = Temporal.Instant.fromEpochMilliseconds(c.at).toZonedDateTimeISO(tz).toPlainDate()
         const point = series.get(keyOf(day))
         if (!point) continue
         point.points += row.effort
         point.done++
      }
   }
   return [...series.values()]
}

/** Current (ending today or yesterday) and best run of consecutive days with a done chore. */
export function streaks(doneDays: Iterable<string>, today: string): { current: number; best: number } {
   const days = [...new Set(doneDays)].sort()
   let best = 0
   let run = 0
   let prev: string | null = null
   for (const day of days) {
      run = prev && Temporal.PlainDate.from(prev).add({ days: 1 }).toString() === day ? run + 1 : 1
      best = Math.max(best, run)
      prev = day
   }
   const yesterday = Temporal.PlainDate.from(today).subtract({ days: 1 }).toString()
   const current = prev === today || prev === yesterday ? run : 0
   return { current, best }
}
