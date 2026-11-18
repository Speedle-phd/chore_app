/**
 * Emoji reactions on chat messages (user request 2026-11-17). Pure.
 * App choices: anyone in the household can react with any single emoji; one reaction per person
 * and emoji (reacting again takes it back); at most MAX_DISTINCT different emojis per message.
 */

export const MAX_DISTINCT = 20

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
/** Keycaps like 1️⃣ are digits plus a combining mark. */
const KEYCAP = /^[#*0-9]️?⃣$/u
/** Pictographs (skin tones and ZWJ families stay one grapheme) and flags (two regional indicators). */
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/u

/** Exactly one emoji as the user sees it (one grapheme), no letters or digits; short enough to store. */
export function isEmoji(value: string): boolean {
   if (!value || value.length > 32) return false
   if (KEYCAP.test(value)) return true
   return [...segmenter.segment(value)].length === 1 && PICTOGRAPHIC.test(value) && !/[\p{L}\p{N}]/u.test(value)
}

export type Reaction = { emoji: string; memberId: string; at: Date }

/** Grouped for display, in the order each emoji was first used; people in reacting order. */
export function groupReactions(reactions: readonly Reaction[]) {
   const groups = new Map<string, { emoji: string; count: number; memberIds: string[]; first: number }>()
   for (const r of [...reactions].sort((a, b) => a.at.getTime() - b.at.getTime())) {
      const g = groups.get(r.emoji) ?? { emoji: r.emoji, count: 0, memberIds: [], first: r.at.getTime() }
      g.count++
      g.memberIds.push(r.memberId)
      groups.set(r.emoji, g)
   }
   return [...groups.values()].sort((a, b) => a.first - b.first).map(({ emoji, count, memberIds }) => ({ emoji, count, memberIds }))
}
