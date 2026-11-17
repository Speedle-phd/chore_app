import { Temporal } from 'temporal-polyfill'
import { creditedCompletions, type StatsRow } from './stats'

/**
 * Badges, derived from the chore history (nothing stored, so they can't drift).
 * The table is the source of truth; `earnBadges` only measures. App choices.
 *
 * Theme (user request 2026-11-16): each badge is an animal — panda, koala, seal,
 * ice bear, racoon, dog, owl, cat — with an adjective that fits the achievement
 * and an accessory drawn on it (frontend/src/features/stats/animals). Ids of the
 * first nine badges stay as they were.
 */
export type BadgeId = (typeof BADGES)[number]['id']
type Measure = 'done' | 'onTime' | 'bigJobs' | 'standIn' | 'streak' | 'earlyBird' | 'nightOwl' | 'weekend' | 'variety'

export const BADGE_ANIMALS = ['panda', 'koala', 'seal', 'icebear', 'racoon', 'dog', 'owl', 'cat'] as const
export const BADGE_ACCESSORIES = ['none', 'sparkles', 'medal', 'crown', 'glasses', 'headband', 'heart', 'hearts', 'sun', 'flame', 'moon', 'shades', 'star'] as const
type Animal = (typeof BADGE_ANIMALS)[number]
type Accessory = (typeof BADGE_ACCESSORIES)[number]

/** Before this local hour counts as early; from this one on as late. App choices. */
export const EARLY_BEFORE_HOUR = 8
export const LATE_FROM_HOUR = 21

export const BADGES = [
   { id: 'first', name: 'Curious Kitten', description: 'Did a first chore.', animal: 'cat', accessory: 'sparkles', measure: 'done', goal: 1 },
   { id: 'ten', name: 'Busy Racoon', description: 'Did 10 chores.', animal: 'racoon', accessory: 'none', measure: 'done', goal: 10 },
   { id: 'twentyfive', name: 'Eager Puppy', description: 'Did 25 chores.', animal: 'dog', accessory: 'none', measure: 'done', goal: 25 },
   { id: 'fifty', name: 'Loyal Dog', description: 'Did 50 chores.', animal: 'dog', accessory: 'medal', measure: 'done', goal: 50 },
   { id: 'hundred', name: 'Mighty Icebear', description: 'Did 100 chores.', animal: 'icebear', accessory: 'medal', measure: 'done', goal: 100 },
   { id: 'legend', name: 'Royal Panda', description: 'Did 250 chores.', animal: 'panda', accessory: 'crown', measure: 'done', goal: 250 },
   { id: 'punctual', name: 'Punctual Owl', description: 'Did 20 chores before they were due.', animal: 'owl', accessory: 'none', measure: 'onTime', goal: 20 },
   { id: 'wise', name: 'Wise Owl', description: 'Did 100 chores before they were due.', animal: 'owl', accessory: 'glasses', measure: 'onTime', goal: 100 },
   { id: 'heavy', name: 'Strong Panda', description: 'Did 5 big jobs (effort 4 or 5).', animal: 'panda', accessory: 'headband', measure: 'bigJobs', goal: 5 },
   { id: 'titan', name: 'Unstoppable Icebear', description: 'Did 25 big jobs (effort 4 or 5).', animal: 'icebear', accessory: 'headband', measure: 'bigJobs', goal: 25 },
   { id: 'standin', name: 'Helpful Seal', description: 'Did 5 chores that were someone else’s.', animal: 'seal', accessory: 'heart', measure: 'standIn', goal: 5 },
   { id: 'guardian', name: 'Kind-hearted Seal', description: 'Did 20 chores that were someone else’s.', animal: 'seal', accessory: 'hearts', measure: 'standIn', goal: 20 },
   { id: 'week', name: 'Wide-awake Koala', description: 'Did chores 7 days in a row.', animal: 'koala', accessory: 'sun', measure: 'streak', goal: 7 },
   { id: 'month', name: 'Tireless Koala', description: 'Did chores 30 days in a row.', animal: 'koala', accessory: 'flame', measure: 'streak', goal: 30 },
   { id: 'early', name: 'Early-bird Cat', description: `Did 10 chores before ${EARLY_BEFORE_HOUR}:00 in the morning.`, animal: 'cat', accessory: 'sun', measure: 'earlyBird', goal: 10 },
   { id: 'night', name: 'Midnight Racoon', description: `Did 10 chores after ${LATE_FROM_HOUR}:00 at night.`, animal: 'racoon', accessory: 'moon', measure: 'nightOwl', goal: 10 },
   { id: 'weekend', name: 'Sunbathing Seal', description: 'Did 10 chores at the weekend.', animal: 'seal', accessory: 'shades', measure: 'weekend', goal: 10 },
   { id: 'variety', name: 'Handy Racoon', description: 'Did 10 different chores.', animal: 'racoon', accessory: 'star', measure: 'variety', goal: 10 },
] as const satisfies readonly { id: string; name: string; description: string; animal: Animal; accessory: Accessory; measure: Measure; goal: number }[]

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

   const count: Record<Measure, number> = { done: 0, onTime: 0, bigJobs: 0, standIn: 0, streak: 0, earlyBird: 0, nightOwl: 0, weekend: 0, variety: 0 }
   const chores = new Set<string>()
   let lastDay: string | null = null
   const earned: EarnedBadge[] = []
   for (const { row, at } of events) {
      const local = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(tz)
      count.done++
      if (at <= row.due) count.onTime++
      if (row.effort >= 4) count.bigJobs++
      if (row.assignees.length && !row.assignees.includes(memberId)) count.standIn++
      if (local.hour < EARLY_BEFORE_HOUR) count.earlyBird++
      if (local.hour >= LATE_FROM_HOUR) count.nightOwl++
      if (local.dayOfWeek >= 6) count.weekend++
      chores.add(row.itemId)
      count.variety = chores.size
      const day = local.toPlainDate().toString()
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
