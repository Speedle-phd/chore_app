/**
 * Pinboard notes and polls (docs/plans/rewards-pinboard-guest.md, phase 3). Pure.
 *
 * User decision (2026-11-16): poll votes are named (everyone sees who voted for what).
 * App choices: posts expire after a preset time (default a week) or never; pinned posts never
 * expire while pinned (unpinning gives them a week); you can change your vote until the poll
 * closes (by its closing time or by hand); an empty vote withdraws it.
 */

const DAY = 24 * 60 * 60 * 1000

export const EXPIRY_PRESETS = ['day', '3days', 'week', 'month', 'never'] as const
export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number]
const EXPIRY_DAYS: Record<ExpiryPreset, number | null> = { day: 1, '3days': 3, week: 7, month: 30, never: null }

/** When a post (or poll) with this preset ends; null = never. */
export const expiresAt = (preset: ExpiryPreset, now: Date): Date | null => {
   const days = EXPIRY_DAYS[preset]
   return days === null ? null : new Date(now.getTime() + days * DAY)
}

/** Time a post gets when it is unpinned. */
export const UNPIN_EXPIRY: ExpiryPreset = 'week'

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 10

export type Vote = { memberId: string; optionIds: string[]; at: Date }
export type Poll = {
   options: { id: string; text: string }[]
   multiple: boolean
   closesAt: Date | null
   closedAt: Date | null
   votes: Vote[]
}

export const isOpen = (poll: Pick<Poll, 'closesAt' | 'closedAt'>, now: Date) =>
   poll.closedAt === null && (poll.closesAt === null || poll.closesAt.getTime() > now.getTime())

/**
 * Whether this viewer may see counts and names: always, unless the poll shows results only
 * after voting; then once they voted or the poll has ended (user request 2026-11-17).
 */
export const resultsVisible = (
   poll: Pick<Poll, 'closesAt' | 'closedAt' | 'votes'> & { resultsAfterVote: boolean },
   viewerId: string,
   now: Date,
) => !poll.resultsAfterVote || !isOpen(poll, now) || poll.votes.some((v) => v.memberId === viewerId)

/** Why a vote isn't valid, or null: known options, each once, at most one unless multiple choice. */
export function voteProblem(poll: Pick<Poll, 'options' | 'multiple'>, optionIds: readonly string[]): string | null {
   if (new Set(optionIds).size !== optionIds.length) return 'Pick each option only once.'
   const known = new Set(poll.options.map((o) => o.id))
   if (optionIds.some((id) => !known.has(id))) return 'That option isn’t part of this poll.'
   if (!poll.multiple && optionIds.length > 1) return 'Pick one option.'
   return null
}

/** Votes after `memberId` votes (replacing their earlier vote); no options = vote withdrawn. */
export function applyVote(votes: readonly Vote[], memberId: string, optionIds: readonly string[], at: Date): Vote[] {
   const others = votes.filter((v) => v.memberId !== memberId)
   return optionIds.length ? [...others, { memberId, optionIds: [...optionIds], at }] : others
}

/** Per option: how many and who (in voting order); plus how many people voted at all. */
export function results(poll: Pick<Poll, 'options' | 'votes'>) {
   const ordered = [...poll.votes].sort((a, b) => a.at.getTime() - b.at.getTime())
   return {
      voters: ordered.length,
      options: poll.options.map((o) => {
         const voterIds = ordered.filter((v) => v.optionIds.includes(o.id)).map((v) => v.memberId)
         return { id: o.id, text: o.text, count: voterIds.length, voterIds }
      }),
   }
}
