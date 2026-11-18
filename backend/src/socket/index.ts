import type { Server as HttpServer } from 'node:http'
import { isValidObjectId } from 'mongoose'
import { Server, type Socket } from 'socket.io'
import { corsOptions } from '../app'
import { readCookie, type Sessions } from '../auth/sessions'
import type { Env } from '../config/env'
import { Membership } from '../models/membershipModel'
import type { ClientToServerEvents, RateBucket, ServerToClientEvents, SocketData } from './contracts'
import { createPresence } from './presence'
import { initRealtime, rooms } from './realtime'

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
type Reply<T> = (result: { ok: true; data?: T } | { ok: false; error: string }) => void

/**
 * Per socket and minute. Typing has its own budget, so a fast writer can't use up the
 * commands (re-subscribing after a reconnect). The client pings at most every 3 s (~20/min)
 * plus a stop per sent message.
 */
const PER_MINUTE: Record<RateBucket, number> = { commands: 60, typing: 60 }

function allow(socket: AppSocket, bucket: RateBucket) {
   const now = Date.now()
   const limit = socket.data.limits[bucket]
   if (now - limit.windowStart > 60_000) {
      limit.windowStart = now
      limit.count = 0
   }
   limit.count += 1
   return limit.count <= PER_MINUTE[bucket]
}

/** Wraps an async command: validation/permission failures and crashes become a safe ack, never a hanging client. */
function command<T>(socket: AppSocket, handler: (householdId: string) => Promise<T>) {
   return (raw: unknown, ack: Reply<T>) => {
      const reply: Reply<T> = typeof ack === 'function' ? ack : () => undefined
      if (!allow(socket, 'commands')) return reply({ ok: false, error: 'Too many requests' })
      if (typeof raw !== 'string' || !isValidObjectId(raw)) return reply({ ok: false, error: 'Invalid household' })
      handler(raw).then(
         (data) => reply(data === undefined ? { ok: true } : { ok: true, data }),
         (error: unknown) => {
            const known = error instanceof Error && error.message === 'Household not found'
            if (!known) console.error('Socket command failed:', error)
            reply({ ok: false, error: known ? 'Household not found' : 'Something went wrong' })
         },
      )
   }
}

type Options = {
   /** Wait before announcing "offline", so a page reload doesn't flicker the dot. */
   presenceGraceMs?: number
}

/**
 * Socket.IO on the same HTTP server as Express. Clients authenticate with the
 * same session cookie as the REST API; there is no separate token.
 */
export function createSocketServer(httpServer: HttpServer, env: Env, sessions: Sessions, options: Options = {}) {
   const graceMs = options.presenceGraceMs ?? 5000
   const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
      cors: corsOptions(env),
      maxHttpBufferSize: 10_000, // clients only send tiny commands
      serveClient: false,
   })
   const allowedOrigin = new URL(env.APP_URL).origin
   const presence = createPresence()

   /** Tells every household the user belongs to (only their members) that they came online / went offline. */
   async function announce(userId: string, online: boolean) {
      const memberships = await Membership.find({ userId }).select('_id householdId').lean()
      for (const m of memberships) {
         io.to(rooms.household(m.householdId)).emit('presence:changed', {
            householdId: m.householdId.toString(),
            memberId: m._id.toString(),
            online,
         })
      }
   }
   const announceSafely = (userId: string, online: boolean) =>
      announce(userId, online).catch((error: unknown) => console.error('Presence update failed:', error))

   io.use(async (socket, next) => {
      try {
         // WebSockets aren't covered by CORS: refuse pages from other sites (cross-site WebSocket hijacking).
         const origin = socket.handshake.headers.origin
         if (origin && origin !== allowedOrigin) return next(new Error('Forbidden origin'))
         const auth = await sessions.resolve(readCookie(socket.request, sessions.cookieName))
         if (!auth) return next(new Error('Not signed in'))
         const now = Date.now()
         socket.data = {
            userId: auth.userId.toString(),
            sessionHash: auth.sessionHash,
            limits: { commands: { count: 0, windowStart: now }, typing: { count: 0, windowStart: now } },
            memberships: new Map(),
         }
         next()
      } catch (error) {
         console.error('Socket handshake failed:', error)
         next(new Error('Not signed in'))
      }
   })

   io.on('connection', (socket) => {
      const { userId } = socket.data
      // Private rooms: the user (for invitations etc.) and the session (to cut it on logout/revoke).
      void socket.join([rooms.user(userId), rooms.session(socket.data.sessionHash)])
      if (presence.connected(userId)) void announceSafely(userId, true)

      socket.on('disconnect', () => {
         if (!presence.disconnected(userId)) return // another tab is still open
         // Only announce if they're still gone after the grace period (a reload reconnects quickly).
         const check = () => {
            if (!presence.isOnline(userId)) void announceSafely(userId, false)
         }
         if (graceMs > 0) setTimeout(check, graceMs).unref()
         else check()
      })

      socket.on(
         'household:subscribe',
         command(socket, async (householdId) => {
            const member = await Membership.exists({ householdId, userId })
            if (!member) throw new Error('Household not found')
            socket.data.memberships.set(householdId, member._id.toString())
            await socket.join(rooms.household(householdId))
            // Who in this household is online right now (as membership ids).
            const online = await Membership.find({ householdId, userId: { $in: presence.onlineUserIds() } })
               .select('_id')
               .lean()
            return { online: online.map((m) => m._id.toString()) }
         }),
      )
      socket.on(
         'household:unsubscribe',
         command(socket, async (householdId): Promise<undefined> => {
            socket.data.memberships.delete(householdId)
            await socket.leave(rooms.household(householdId))
            return undefined
         }),
      )

      // "Ann is typing…": passed on to the rest of the household, nothing stored. Only from a socket
      // that is still in the room: subscribing checked the membership, and removal takes it out.
      const relayTyping = (event: 'chat:typing' | 'chat:typing-stop') => (raw: unknown) => {
         if (typeof raw !== 'string' || !allow(socket, 'typing')) return
         const room = rooms.household(raw)
         const memberId = socket.data.memberships.get(raw)
         if (!memberId || !socket.rooms.has(room)) return
         socket.to(room).emit(event, { householdId: raw, memberId })
      }
      socket.on('chat:typing', relayTyping('chat:typing'))
      socket.on('chat:typing-stop', relayTyping('chat:typing-stop'))
   })

   initRealtime(io)
   return io
}
