import { Router, type Request } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { TooManyRequestsError, UnauthorizedError } from '../errors'
import { audit } from './audit'
import { userView } from './authViews'
import type { PasskeyService } from './passkeys'
import type { Sessions } from './sessions'

const name = z.string().trim().min(1, 'Enter a name.').max(60)
// The WebAuthn payloads are validated by @simplewebauthn/server; here we only check their shape.
const credential = z.object({ id: z.string().min(1).max(1024), type: z.literal('public-key') }).passthrough()
const registerSchema = z.object({ challengeId: z.string(), response: credential, name: name.default('Passkey') })
const loginSchema = z.object({ challengeId: z.string(), response: credential })

const userIdOf = (req: Request) => {
   if (!req.auth) throw new UnauthorizedError('Not signed in')
   return req.auth.userId
}

/** Mounted at /api/auth/passkeys. Login works without a session; the rest needs one. */
export function createPasskeyRoutes(passkeys: PasskeyService, sessions: Sessions, loginLimit: number) {
   const router = Router()
   const limiter = rateLimit({
      windowMs: 15 * 60_000,
      limit: loginLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new TooManyRequestsError('Too many sign-in attempts. Please wait a few minutes.', 900)),
   })

   router.post('/login/options', limiter, async (_req, res) => {
      res.json(await passkeys.loginOptions())
   })
   router.post('/login', limiter, async (req, res) => {
      const { challengeId, response } = loginSchema.parse(req.body)
      const user = await passkeys.login(challengeId, response as never)
      await sessions.start(req, res, user._id) // new session id, as with password login
      await audit(req, 'login_success', user._id)
      res.json(userView(user))
   })

   router.use(sessions.requireSession)
   router.get('/', async (req, res) => {
      res.json(await passkeys.list(userIdOf(req)))
   })
   router.post('/register/options', async (req, res) => {
      res.json(await passkeys.registrationOptions(userIdOf(req)))
   })
   router.post('/register', async (req, res) => {
      const input = registerSchema.parse(req.body)
      const passkey = await passkeys.register(userIdOf(req), input.challengeId, input.response as never, input.name)
      await audit(req, 'passkey_added', userIdOf(req))
      res.status(201).json(passkey)
   })
   router.patch('/:id', async (req, res) => {
      const parsed = z.object({ name }).parse(req.body)
      res.json(await passkeys.rename(userIdOf(req), String(req.params.id), parsed.name))
   })
   router.delete('/:id', async (req, res) => {
      await passkeys.remove(userIdOf(req), String(req.params.id))
      await audit(req, 'passkey_removed', userIdOf(req))
      res.status(204).end()
   })
   return router
}
