import type { Server as HttpServer } from 'node:http'
import { isValidObjectId } from 'mongoose'
import { Server, type Socket } from 'socket.io'
import { corsOptions } from '../app'
import { readCookie, type Sessions } from '../auth/sessions'
import type { Env } from '../config/env'
import { Membership } from '../models/membershipModel'
import type { Ack, ClientToServerEvents, ServerToClientEvents, SocketData } from './contracts'
import { initRealtime, rooms } from './realtime'

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

const COMMANDS_PER_MINUTE = 60

/** Simple per-socket rate limit for client commands. */
function allowCommand(socket: AppSocket) {
   const now = Date.now()
   if (now - socket.data.windowStart > 60_000) {
      socket.data.windowStart = now
      socket.data.commands = 0
   }
   socket.data.commands += 1
   return socket.data.commands <= COMMANDS_PER_MINUTE
}

/** Wraps an async command: validation/permission failures and crashes become a safe ack, never a hanging client. */
function command(socket: AppSocket, handler: (householdId: string) => Promise<void>) {
   return (raw: unknown, ack: Ack) => {
      const reply: Ack = typeof ack === 'function' ? ack : () => undefined
      if (!allowCommand(socket)) return reply({ ok: false, error: 'Too many requests' })
      if (typeof raw !== 'string' || !isValidObjectId(raw)) return reply({ ok: false, error: 'Invalid household' })
      handler(raw).then(
         () => reply({ ok: true }),
         (error: unknown) => {
            const known = error instanceof Error && error.message === 'Household not found'
            if (!known) console.error('Socket command failed:', error)
            reply({ ok: false, error: known ? 'Household not found' : 'Something went wrong' })
         },
      )
   }
}

/**
 * Socket.IO on the same HTTP server as Express. Clients authenticate with the
 * same session cookie as the REST API; there is no separate token.
 */
export function createSocketServer(httpServer: HttpServer, env: Env, sessions: Sessions) {
   const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
      cors: corsOptions(env),
      maxHttpBufferSize: 10_000, // clients only send tiny commands
      serveClient: false,
   })
   const allowedOrigin = new URL(env.APP_URL).origin

   io.use(async (socket, next) => {
      try {
         // WebSockets aren't covered by CORS: refuse pages from other sites (cross-site WebSocket hijacking).
         const origin = socket.handshake.headers.origin
         if (origin && origin !== allowedOrigin) return next(new Error('Forbidden origin'))
         const auth = await sessions.resolve(readCookie(socket.request, sessions.cookieName))
         if (!auth) return next(new Error('Not signed in'))
         socket.data = { userId: auth.userId.toString(), sessionHash: auth.sessionHash, commands: 0, windowStart: Date.now() }
         next()
      } catch (error) {
         console.error('Socket handshake failed:', error)
         next(new Error('Not signed in'))
      }
   })

   io.on('connection', (socket) => {
      // Private rooms: the user (for invitations etc.) and the session (to cut it on logout/revoke).
      void socket.join([rooms.user(socket.data.userId), rooms.session(socket.data.sessionHash)])

      socket.on(
         'household:subscribe',
         command(socket, async (householdId) => {
            const member = await Membership.exists({ householdId, userId: socket.data.userId })
            if (!member) throw new Error('Household not found')
            await socket.join(rooms.household(householdId))
         }),
      )
      socket.on(
         'household:unsubscribe',
         command(socket, async (householdId) => {
            await socket.leave(rooms.household(householdId))
         }),
      )
   })

   initRealtime(io)
   return io
}
