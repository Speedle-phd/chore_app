/**
 * Socket.IO event contract. Mirrored in frontend/src/lib/socketContracts.ts.
 * Events only say *what* changed; clients refetch through the normal API, so
 * the same authorization applies and no personal data travels over the socket.
 */
export type HouseholdTopic = 'household' | 'members' | 'invitations' | 'calendar' | 'shopping' | 'recipes' | 'packing' | 'rewards' | 'pinboard'
export type UserTopic = 'households' | 'invitations' | 'profile'

export type ServerToClientEvents = {
   'household:changed': (event: { householdId: string; topics: HouseholdTopic[]; at: string }) => void
   'user:changed': (event: { topics: UserTopic[]; at: string }) => void
   /** A member of a household came online or went offline (memberId = membership id). */
   'presence:changed': (event: { householdId: string; memberId: string; online: boolean }) => void
}

/** Subscribing answers with the household's members that are online right now. */
export type SubscribeResult = { online: string[] }
export type Ack<T = undefined> = (result: { ok: true; data?: T } | { ok: false; error: string }) => void

export type ClientToServerEvents = {
   'household:subscribe': (householdId: unknown, ack: Ack<SubscribeResult>) => void
   'household:unsubscribe': (householdId: unknown, ack: Ack) => void
}

export type SocketData = { userId: string; sessionHash: string; commands: number; windowStart: number }
