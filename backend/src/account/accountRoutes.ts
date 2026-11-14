import { Router, type Request } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { audit } from '../auth/audit'
import { userView } from '../auth/authViews'
import type { Sessions } from '../auth/sessions'
import { BadRequestError, ConflictError, TooManyRequestsError, UnauthorizedError } from '../errors'
import upload from '../middleware/avatarUpload'
import { User } from '../models/userModel'
import type { AccountService } from './accountService'

/** 3–30 characters: letters, digits, dot, underscore; stored lowercase. */
export const handleSchema = z
   .string()
   .trim()
   .toLowerCase()
   .regex(/^[a-z0-9._]{3,30}$/, 'Use 3–30 letters, digits, dots or underscores.')

const personName = z.string().trim().min(1, 'Enter a name.').max(50)
const updateSchema = z
   .object({
      fname: personName.optional(),
      lname: personName.optional(),
      handle: handleSchema.nullable().optional(),
      findableByHandle: z.boolean().optional(),
   })
   .strict()
const deleteSchema = z.object({ password: z.string().min(1, 'Enter your password.').max(256) })

const userIdOf = (req: Request) => {
   if (!req.auth) throw new UnauthorizedError('Not signed in')
   return req.auth.userId
}

/** Mounted at /api/account behind requireSession. */
export function createAccountRoutes(account: AccountService, sessions: Sessions) {
   const router = Router()

   router.patch('/', async (req, res) => {
      const input = updateSchema.parse(req.body)
      const user = await account.updateProfile(userIdOf(req), { fname: input.fname, lname: input.lname })

      if (input.handle !== undefined) user.handle = input.handle
      if (input.findableByHandle !== undefined) user.findableByHandle = input.findableByHandle
      // Nobody can find you without a handle.
      if (!user.handle) user.findableByHandle = false
      try {
         await user.save()
      } catch (error) {
         if ((error as { code?: number }).code === 11000) throw new ConflictError('That handle is already taken.')
         throw error
      }
      res.json(userView(user))
   })

   router.put('/avatar', upload.single('avatar'), async (req, res) => {
      if (!req.file) throw new BadRequestError('Choose an image.')
      res.json(userView(await account.setAvatar(userIdOf(req), req.file.buffer)))
   })
   router.delete('/avatar', async (req, res) => {
      res.json(userView(await account.removeAvatar(userIdOf(req))))
   })

   router.get('/deletion-check', async (req, res) => {
      res.json(await account.deletionCheck(userIdOf(req)))
   })
   router.post('/delete', async (req, res) => {
      const { password } = deleteSchema.parse(req.body)
      const userId = userIdOf(req)
      await account.deleteAccount(userId, password, new Date())
      await audit(req, 'account_deleted', userId)
      await sessions.end(req, res)
      res.status(204).end()
   })

   return router
}

/** Mounted at /api/users behind requireSession. Exact, opt-in handle lookup only. */
export function createUserSearchRoutes(searchLimit: number) {
   const router = Router()
   const limiter = rateLimit({
      windowMs: 15 * 60_000,
      limit: searchLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new TooManyRequestsError('Too many searches. Please wait a few minutes.', 900)),
   })

   router.get('/search', limiter, async (req, res) => {
      if (!req.auth) throw new UnauthorizedError('Not signed in')
      const parsed = handleSchema.safeParse(String(req.query.handle ?? '').replace(/^@/, ''))
      if (!parsed.success) return void res.json(null)
      const user = await User.findOne({
         handle: parsed.data,
         findableByHandle: true,
         _id: { $ne: req.auth.userId },
      }).lean()
      res.json(user ? { id: user._id.toString(), fullName: `${user.fname} ${user.lname}`.trim(), handle: user.handle } : null)
   })

   return router
}
