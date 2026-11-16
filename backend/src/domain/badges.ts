import { Temporal } from 'temporal-polyfill'
import { creditedCompletions, type StatsRow } from './stats'

/**
 * Badges, derived from the chore history (nothing stored, so they can't drift).
 * The table is the source of truth; `earnBadges` only measures. App choices.
 */
export type BadgeId = (typeof BADGES)[number]['id']
type Measure = 'done' | 'onTime' | 'bigJobs' | 'standIn' | 'streak'

export const BADGES = [
   { id: 'first', name: 'First chore', description: 'Did a first chore.', icon: 'sparkles', measure: 'done', goal: 1 },
   { id: 'ten', name: 'Ten done', description: 'Did 10 chores.', icon: 'medal', measure: 'done', goal: 10 },
   { id: 'fifty', name: 'Fifty done', description: 'Did 50 chores.', icon: 'award', measure: 'done', goal: 50 },
   { id: 'hundred', name: 'Hundred club', description: 'Did 100 chores.', icon: 'trophy', measure: 'done', goal: 100 },
   { id: 'punctual', name: 'Right on time', description: 'Did 20 chores before they were due.', icon: 'clock', measure: 'onTime', goal: 20 },
   { id: 'heavy', name: 'Heavy lifter', description: 'Did 5 big jobs (effort 4 or 5).', icon: 'dumbbell', measure: 'bigJobs', goal: 5 },
   { id: 'standin', name: 'Stand-in', description: 'Did 5 chores that were someone else’s.', icon: 'hand-heart', measure: 'standIn', goal: 5 },
   { id: 'week', name: 'Week streak', description: 'Did chores 7 days in a row.', icon: 'flame', measure: 'streak', goal: 7 },
   { id: 'month', name: 'Month streak', description: 'Did chores 30 days in a row.', icon: 'flame-kindling', measure: 'streak', goal: 30 },
] as const satisfies readonly { id: string; name: string; description: string; icon: string; measure: Measure; goal: number }[]

export type EarnedBadge = { id: BadgeId; earnedAt: number }

/** Badges a member has earned, with the moment each was reached. */
export function earnBadges(rows: StatsRow[], memberId: string, tz: string): EarnedBadge[] {
   return walk(rows, memberId, tz).earned
}

export type BadgeProgress = { id: BadgeId; value: number; goal: number }

/**
 * How far a member is towards each badge (value capped at the goal). Counts are
 * over all time; streak badges count the *current* streak, since a broken one restarts.
 */
export function badgeProgress(rows: StatsRow[], memberId: string, tz: string, currentStreak: number): BadgeProgress[] {
   const { earned, count } = walk(rows, memberId, tz)
   return BADGES.map((b) => {
      const value = earned.some((e) => e.id === b.id) ? b.goal : b.measure === 'streak' ? currentStreak : count[b.measure]
      return { id: b.id, value: Math.min(value, b.goal), goal: b.goal }
   })
}

/** One pass over a member's credited completions: what was earned when, and the final counts. */
function walk(rows: StatsRow[], memberId: string, tz: string) {
   const events = rows
      .flatMap((row) =>
         creditedCompletions(row)
            .filter((c) => c.memberId === memberId)
            .map((c) => ({ row, at: c.at })),
      )
      .sort((a, b) => a.at - b.at)

   const count: Record<Measure, number> = { done: 0, onTime: 0, bigJobs: 0, standIn: 0, streak: 0 }
   let lastDay: string | null = null
   const earned: EarnedBadge[] = []
   for (const { row, at } of events) {
      count.done++
      if (at <= row.due) count.onTime++
      if (row.effort >= 4) count.bigJobs++
      if (row.assignees.length && !row.assignees.includes(memberId)) count.standIn++
      const day = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(tz).toPlainDate().toString()
      if (day !== lastDay) {
         const next = lastDay && Temporal.PlainDate.from(lastDay).add({ days: 1 }).toString()
         count.streak = next === day ? count.streak + 1 : 1
         lastDay = day
      }
      for (const badge of BADGES) {
         if (count[badge.measure] >= badge.goal && !earned.some((e) => e.id === badge.id)) earned.push({ id: badge.id, earnedAt: at })
      }
   }
   return { earned, count }
}
