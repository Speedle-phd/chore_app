import { EMOJI_GROUPS, type EmojiGroup } from './emojiData'

/** Groups with the emojis whose name contains every word of the query. */
export function searchEmojis(query: string, groups: readonly EmojiGroup[] = EMOJI_GROUPS): EmojiGroup[] {
   const words = query.toLowerCase().split(/\s+/).filter(Boolean)
   if (!words.length) return [...groups]
   return groups
      .map((g) => ({ ...g, emojis: g.emojis.filter((x) => words.every((w) => x.name.includes(w))) }))
      .filter((g) => g.emojis.length > 0)
}

/** The text with `insert` placed at the caret (replacing a selection), and where the caret goes next. */
export function insertAt(value: string, start: number | null, end: number | null, insert: string) {
   const from = start ?? value.length
   const to = end ?? from
   return { value: value.slice(0, from) + insert + value.slice(to), caret: from + insert.length }
}

/** Most recent first, each once, at most `max`. */
export const addRecent = (recent: readonly string[], char: string, max = 16) => [char, ...recent.filter((c) => c !== char)].slice(0, max)
