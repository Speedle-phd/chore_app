import type { Server } from 'socket.io'
import type { Types } from 'mongoose'
import type { ClientToServerEvents, HouseholdTopic, ServerToClientEvents, SocketData, UserTopic } from './contracts'

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
type Id = Types.ObjectId | string

let io: IO | null = null

/** Called once when the socket server starts. Until then every call is a no-op. */
export function initRealtime(server: IO | null) {
   io = server
}

export const rooms = {
   user: (id: Id) => `user:${String(id)}`,
   household: (id: Id) => `household:${String(id)}`,
   session: (hash: string) => `session:${hash}`,
}

/**
 * The only thing services use. Call these *after* a successful write; events
 * just name the topics that changed, clients refetch what they need.
 */
export const realtime = {
   householdChanged(householdId: Id, ...topics: HouseholdTopic[]) {
      io?.to(rooms.household(householdId)).emit('household:changed', {
         householdId: String(householdId),
         topics,
         at: new Date().toISOString(),
      })
   },

   userChanged(userIds: Id | Id[], ...topics: UserTopic[]) {
      const targets = (Array.isArray(userIds) ? userIds : [userIds]).map(rooms.user)
      if (targets.length) io?.to(targets).emit('user:changed', { topics, at: new Date().toISOString() })
   },

   /** Access ended (removed / left / household deleted): stop that user's tabs receiving its events. */
   removeFromHousehold(userId: Id, householdId: Id) {
      io?.in(rooms.user(userId)).socketsLeave(rooms.household(householdId))
   },

   /** Sessions were revoked: disconnect the sockets that were authenticated with them. */
   endSessions(hashes: string[]) {
      if (hashes.length) io?.in(hashes.map(rooms.session)).disconnectSockets(true)
   },
}
