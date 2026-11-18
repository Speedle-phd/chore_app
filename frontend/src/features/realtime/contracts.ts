/**
 * Socket.IO event contract. Copy of backend/src/socket/contracts.ts: keep both in sync.
 * Events only say *what* changed; clients refetch through the normal API, so
 * the same authorization applies and no personal data travels over the socket.
 * Exception: `chat:typing*` carry who is typing (ephemeral, nothing stored, nothing to refetch).
 */
export type HouseholdTopic = 'household' | 'members' | 'invitations' | 'calendar' | 'shopping' | 'recipes' | 'packing' | 'rewards' | 'pinboard' | 'chat' | 'guest'
export type UserTopic = 'households' | 'invitations' | 'profile'

export type ServerToClientEvents = {
   'household:changed': (event: { householdId: string; topics: HouseholdTopic[]; at: string }) => void
   'user:changed': (event: { topics: UserTopic[]; at: string }) => void
   /** A member of a household came online or went offline (memberId = membership id). */
   'presence:changed': (event: { householdId: string; memberId: string; online: boolean }) => void
   /** Someone in the household chat is typing / stopped (memberId = membership id). Never sent back to the sender. */
   'chat:typing': (event: TypingEvent) => void
   'chat:typing-stop': (event: TypingEvent) => void
}

export type TypingEvent = { householdId: string; memberId: string }

/** Subscribing answers with the household's members that are online right now. */
export type SubscribeResult = { online: string[] }
export type Ack<T = undefined> = (result: { ok: true; data?: T } | { ok: false; error: string }) => void

export type ClientToServerEvents = {
   'household:subscribe': (householdId: unknown, ack: Ack<SubscribeResult>) => void
   'household:unsubscribe': (householdId: unknown, ack: Ack) => void
   /** Fire and forget (no ack): only relayed for a household this socket subscribed to. */
   'chat:typing': (householdId: unknown) => void
   'chat:typing-stop': (householdId: unknown) => void
}

export type RateBucket = 'commands' | 'typing'
export type SocketData = {
   userId: string
   sessionHash: string
   /** Per-socket rate limits, one window per kind of event. */
   limits: Record<RateBucket, { count: number; windowStart: number }>
   /** Households this socket subscribed to → the user's membership id there. */
   memberships: Map<string, string>
}
