import type { Poll } from './pinboardApi'

/**
 * The poll as it will look after `voterId` votes for `optionIds` (optimistic update; the
 * server's answer replaces it). Mirrors backend domain/pinboard.ts applyVote + results.
 * With hidden results nothing is known locally, so only the voter's own marks change later.
 */
export function applyLocalVote(poll: Poll, voterId: string, optionIds: readonly string[]): Poll {
   if (!poll.resultsVisible) return poll
   const hadVoted = poll.options.some((o) => o.voterIds.includes(voterId))
   const options = poll.options.map((o) => {
      const voterIds = o.voterIds.filter((id) => id !== voterId)
      if (optionIds.includes(o.id)) voterIds.push(voterId)
      return { ...o, voterIds, count: voterIds.length }
   })
   const voters = poll.voters + (optionIds.length ? (hadVoted ? 0 : 1) : hadVoted ? -1 : 0)
   return { ...poll, options, voters }
}

/** Whole percent of the people who voted (several answers can add up to more than 100). */
export const percent = (count: number | null, voters: number) => (count === null || voters === 0 ? 0 : Math.round((count / voters) * 100))

/** Options with the most votes (none before the first vote; several on a tie). */
export function leaders(poll: Pick<Poll, 'options'>): string[] {
   const top = Math.max(0, ...poll.options.map((o) => o.count ?? 0))
   return top === 0 ? [] : poll.options.filter((o) => o.count === top).map((o) => o.id)
}

/** "Ends in 3 h", "Ends tomorrow", "Ends in 4 days"; "Ended" once closed or past. */
export function endLabel(poll: Pick<Poll, 'open' | 'closesAt'>, now: Date): string | null {
   if (!poll.open) return 'Ended'
   if (!poll.closesAt) return null
   const ms = new Date(poll.closesAt).getTime() - now.getTime()
   const hours = Math.ceil(ms / 3_600_000)
   if (hours <= 1) return 'Ends within the hour'
   if (hours < 24) return `Ends in ${hours} h`
   const days = Math.round(hours / 24)
   return days === 1 ? 'Ends tomorrow' : `Ends in ${days} days`
}
