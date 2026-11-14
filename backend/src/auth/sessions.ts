import type { CookieOptions, NextFunction, Request, Response } from 'express'
import type { Types } from 'mongoose'
import { UnauthorizedError } from '../errors'
import { Session } from '../models/sessionModel'
import { realtime } from '../socket/realtime'
import { randomToken, sha256 } from './crypto'

const ABSOLUTE_MS = 30 * 24 * 60 * 60_000 // 30 days
export const IDLE_MS = 7 * 24 * 60 * 60_000 // 7 days without use
const TOUCH_EVERY_MS = 5 * 60_000 // write lastSeenAt at most every 5 min

export type SessionConfig = { cookieName: string; secure: boolean }

/** `__Host-` forces Secure, Path=/ and no Domain; it needs a secure context. */
export const sessionConfig = (secure: boolean): SessionConfig => ({
   cookieName: secure ? '__Host-session' : 'session',
   secure,
})

/** Works for Express requests and the raw handshake request of Socket.IO. */
export function readCookie(req: { headers: { cookie?: string | undefined } }, name: string): string | null {
   for (const part of (req.headers.cookie ?? '').split(';')) {
      const [key, ...rest] = part.trim().split('=')
      if (key === name) {
         try {
            return decodeURIComponent(rest.join('='))
         } catch {
            return null
         }
      }
   }
   return null
}

export function createSessions({ cookieName, secure }: SessionConfig) {
   const cookieOptions = (maxAge: number): CookieOptions => ({
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge,
   })

   /** Always a fresh id (prevents session fixation). */
   async function start(req: Request, res: Response, userId: Types.ObjectId) {
      const token = randomToken()
      const now = new Date()
      await Session.create({
         idHash: sha256(token),
         userId,
         createdAt: now,
         lastSeenAt: now,
         expiresAt: new Date(now.getTime() + ABSOLUTE_MS),
         userAgent: req.get('user-agent') ?? null,
         ip: req.ip ?? null,
      })
      res.cookie(cookieName, token, cookieOptions(ABSOLUTE_MS))
   }

   /** Deletes the current session (if any) and clears the cookie; returns its user. */
   async function end(req: Request, res: Response): Promise<Types.ObjectId | null> {
      const token = readCookie(req, cookieName)
      const ended = token
         ? await Session.findOneAndDelete({ idHash: sha256(token) }).lean()
         : null
      res.clearCookie(cookieName, cookieOptions(0))
      if (ended) realtime.endSessions([ended.idHash])
      return ended?.userId ?? null
   }

   /** Revokes every session of a user, optionally keeping the current one. Live connections are cut too. */
   async function endAllForUser(userId: Types.ObjectId, exceptHash?: string) {
      const filter = exceptHash ? { userId, idHash: { $ne: exceptHash } } : { userId }
      const hashes = (await Session.find(filter).select('idHash').lean()).map((s) => s.idHash)
      const { deletedCount } = await Session.deleteMany(filter)
      realtime.endSessions(hashes)
      return { deletedCount }
   }

   /** A valid (not expired, not idle) session for this cookie value, refreshing lastSeenAt sparingly. */
   async function resolve(token: string | null) {
      if (!token) return null
      const idHash = sha256(token)
      const now = new Date()
      const session = await Session.findOne({
         idHash,
         expiresAt: { $gt: now },
         lastSeenAt: { $gt: new Date(now.getTime() - IDLE_MS) },
      }).lean()
      if (!session) return null
      if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
         await Session.updateOne({ idHash }, { $set: { lastSeenAt: now } })
      }
      return { userId: session.userId, sessionHash: idHash }
   }

   /** Attaches req.auth = { userId, sessionHash } or responds 401. */
   async function requireSession(
      req: Request,
      _res: Response,
      next: NextFunction,
   ) {
      const auth = await resolve(readCookie(req, cookieName))
      if (!auth) throw new UnauthorizedError('Not signed in')
      req.auth = auth
      next()
   }

   return { start, end, endAllForUser, requireSession, resolve, cookieName }
}

export type Sessions = ReturnType<typeof createSessions>
