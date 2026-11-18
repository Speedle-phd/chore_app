/** Someone counts as typing until this long after their last ping (they ping every few seconds). */
export const TYPING_TTL_MS = 6000
/** How often the writer's client says "still typing" at most. */
export const TYPING_PING_MS = 3000

/** Membership id → time of the last ping (ms). Insertion order = who started first. */
export type TypingState = Record<string, number>

export const typingPing = (state: TypingState, memberId: string, now: number): TypingState => ({ ...state, [memberId]: now })

export function typingStop(state: TypingState, memberId: string): TypingState {
   if (!(memberId in state)) return state
   const { [memberId]: _gone, ...rest } = state
   return rest
}

/** Who is still typing at `now`, in the order they started. */
export const typingNow = (state: TypingState, now: number): string[] =>
   Object.entries(state)
      .filter(([, at]) => now - at < TYPING_TTL_MS)
      .map(([id]) => id)

/** Drops expired entries; returns the same object when nothing changed (no needless re-render). */
export function pruneTyping(state: TypingState, now: number): TypingState {
   const active = typingNow(state, now)
   if (active.length === Object.keys(state).length) return state
   return Object.fromEntries(active.map((id) => [id, state[id] ?? now]))
}

/** "Ann is typing", "Ann and Ben are typing", "Several people are typing" (the dots are drawn separately). */
export function typingText(names: string[]): string | null {
   if (names.length === 0) return null
   if (names.length === 1) return `${names[0]} is typing`
   if (names.length === 2) return `${names[0]} and ${names[1]} are typing`
   return 'Several people are typing'
}
