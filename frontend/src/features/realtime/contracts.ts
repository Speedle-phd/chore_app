/**
 * Socket.IO event contract. Copy of backend/src/socket/contracts.ts: keep both in sync.
 * Events only say *what* changed; clients refetch through the normal API, so
 * the same authorization applies and no personal data travels over the socket.
 */
export type HouseholdTopic = 'household' | 'members' | 'invitations'
export type UserTopic = 'households' | 'invitations' | 'profile'

export type ServerToClientEvents = {
   'household:changed': (event: { householdId: string; topics: HouseholdTopic[]; at: string }) => void
   'user:changed': (event: { topics: UserTopic[]; at: string }) => void
}

export type Ack = (result: { ok: true } | { ok: false; error: string }) => void

export type ClientToServerEvents = {
   'household:subscribe': (householdId: unknown, ack: Ack) => void
   'household:unsubscribe': (householdId: unknown, ack: Ack) => void
}

export type SocketData = { userId: string; sessionHash: string; commands: number; windowStart: number }
