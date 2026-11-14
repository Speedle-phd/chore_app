import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from './contracts'

/**
 * One socket per tab. Same origin as the app (proxied to the backend), so the
 * session cookie authenticates it. Connected only while signed in.
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
   path: '/socket.io',
   autoConnect: false,
   withCredentials: true,
})
