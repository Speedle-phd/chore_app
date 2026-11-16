import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { NotFoundError, TooManyRequestsError, UnauthorizedError } from '../errors'
import { realtime } from '../socket/realtime'
import { isValidObjectId } from 'mongoose'
import { Session } from '../models/sessionModel'
import { User } from '../models/userModel'
import { audit } from './audit'
import {
   changePasswordSchema,
   emailOnlySchema,
   loginSchema,
   resetPasswordSchema,
   signupSchema,
   tokenSchema,
} from './authSchemas'
import { BAD_CREDENTIALS, type AuthService } from './authService'
import { userView } from './authViews'
import { IDLE_MS, type Sessions } from './sessions'

/** Per-IP limits per 15 minutes (the per-account login throttle is separate). */
export type RateLimits = { login: number; email: number; token: number; search: number }
export const DEFAULT_RATE_LIMITS: RateLimits = { login: 30, email: 10, token: 30, search: 30 }

const CHECK_EMAIL = {
   message: 'If that address can be used, we’ve sent an email with the next step.',
}

export function limiter(limit: number) {
   return rateLimit({
      windowMs: 15 * 60_000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next, options) =>
         next(
            new TooManyRequestsError(
               'Too many requests. Please wait a few minutes and try again.',
               Math.ceil(options.windowMs / 1000),
            ),
         ),
   })
}

export function createAuthRoutes(
   auth: AuthService,
   sessions: Sessions,
   limits: RateLimits = DEFAULT_RATE_LIMITS,
) {
   const router = Router()
   const loginLimit = limiter(limits.login)
   const emailLimit = limiter(limits.email)
   const tokenLimit = limiter(limits.token)

   router.post('/signup', emailLimit, async (req, res) => {
      const input = signupSchema.parse(req.body)
      const { created } = await auth.signup(input, new Date())
      if (created) await audit(req, 'signup', created._id)
      res.status(202).json(CHECK_EMAIL)
   })

   router.post('/verify-email/resend', emailLimit, async (req, res) => {
      const { email } = emailOnlySchema.parse(req.body)
      await auth.resendVerification(email, new Date())
      res.status(202).json(CHECK_EMAIL)
   })

   router.post('/verify-email', tokenLimit, async (req, res) => {
      const { token } = tokenSchema.parse(req.body)
      const user = await auth.verifyEmail(token, new Date())
      await audit(req, 'email_verified', user._id)
      await sessions.start(req, res, user._id)
      res.status(200).json(userView(user))
   })

   router.post('/login', loginLimit, async (req, res) => {
      const { email, password } = loginSchema.parse(req.body)
      let result
      try {
         result = await auth.login(email, password, new Date())
      } catch (error) {
         if (error instanceof TooManyRequestsError) await audit(req, 'login_locked')
         throw error
      }
      if (!result.user) {
         await audit(req, 'login_failure', result.failedUserId)
         throw new UnauthorizedError(BAD_CREDENTIALS, 'INVALID_CREDENTIALS')
      }
      await sessions.start(req, res, result.user._id)
      await audit(req, 'login_success', result.user._id)
      res.status(200).json(userView(result.user))
   })

   router.post('/logout', async (req, res) => {
      const userId = await sessions.end(req, res)
      if (userId) await audit(req, 'logout', userId)
      res.status(204).end()
   })

   router.get('/me', sessions.requireSession, async (req, res) => {
      const user = await User.findById(req.auth?.userId)
      if (!user) throw new UnauthorizedError('Not signed in')
      res.json(userView(user))
   })

   router.post('/password/forgot', emailLimit, async (req, res) => {
      const { email } = emailOnlySchema.parse(req.body)
      const user = await auth.forgotPassword(email, new Date())
      await audit(req, 'password_reset_requested', user?._id ?? null)
      res.status(202).json(CHECK_EMAIL)
   })

   router.post('/password/reset', tokenLimit, async (req, res) => {
      const { token, password } = resetPasswordSchema.parse(req.body)
      const user = await auth.resetPassword(token, password, new Date())
      // Everything signed in before the reset is signed out; this device gets a fresh session.
      await sessions.endAllForUser(user._id)
      await sessions.start(req, res, user._id)
      await audit(req, 'password_reset', user._id)
      res.status(200).json(userView(user))
   })

   router.post(
      '/password/change',
      sessions.requireSession,
      async (req, res) => {
         const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
         const auth_ = req.auth
         if (!auth_) throw new UnauthorizedError('Not signed in')
         const user = await auth.changePassword(
            auth_.userId,
            currentPassword,
            newPassword,
            new Date(),
         )
         await sessions.endAllForUser(user._id, auth_.sessionHash)
         await audit(req, 'password_changed', user._id)
         res.status(200).json(userView(user))
      },
   )

   // Signed-in devices. Only the caller's own sessions; the session id itself never leaves the server.
   router.get('/sessions', sessions.requireSession, async (req, res) => {
      const auth_ = req.auth
      if (!auth_) throw new UnauthorizedError('Not signed in')
      const now = Date.now()
      const list = await Session.find({
         userId: auth_.userId,
         expiresAt: { $gt: new Date(now) },
         lastSeenAt: { $gt: new Date(now - IDLE_MS) },
      })
         .sort({ lastSeenAt: -1 })
         .lean()
      res.json(
         list.map((s) => ({
            id: s._id.toString(),
            current: s.idHash === auth_.sessionHash,
            userAgent: s.userAgent,
            createdAt: s.createdAt.toISOString(),
            lastSeenAt: s.lastSeenAt.toISOString(),
         })),
      )
   })

   router.delete('/sessions/:id', sessions.requireSession, async (req, res) => {
      const auth_ = req.auth
      if (!auth_) throw new UnauthorizedError('Not signed in')
      const id = String(req.params.id)
      const removed = isValidObjectId(id)
         ? await Session.findOneAndDelete({ _id: id, userId: auth_.userId, idHash: { $ne: auth_.sessionHash } })
         : null
      if (!removed) throw new NotFoundError('Session not found')
      realtime.endSessions([removed.idHash])
      await audit(req, 'session_revoked', auth_.userId)
      res.status(204).end()
   })

   /** "Sign out everywhere else": keeps only the current session. */
   router.delete('/sessions', sessions.requireSession, async (req, res) => {
      const auth_ = req.auth
      if (!auth_) throw new UnauthorizedError('Not signed in')
      const { deletedCount } = await sessions.endAllForUser(auth_.userId, auth_.sessionHash)
      if (deletedCount) await audit(req, 'session_revoked', auth_.userId)
      res.json({ signedOut: deletedCount })
   })

   return router
}
