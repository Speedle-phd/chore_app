import { Router, type NextFunction, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { TooManyRequestsError, UnauthorizedError } from '../errors'
import { INVITABLE_ROLES } from '../models/invitationModel'
import type { MembershipType } from '../models/membershipModel'
import type { InvitationService } from './invitationService'

const role = z.enum(INVITABLE_ROLES).default('member')
const claims = z.string().optional()
export const createInvitationSchema = z.discriminatedUnion('kind', [
   z.object({
      kind: z.literal('email'),
      email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.')),
      role,
      claimsMembershipId: claims,
   }),
   z.object({ kind: z.literal('user'), userId: z.string(), role, claimsMembershipId: claims }),
   z.object({ kind: z.literal('link'), role, maxUses: z.number().int().min(1).max(100).default(25) }),
])
const tokenSchema = z.object({ token: z.string().min(20).max(200) })

const userId = (req: Request) => {
   if (!req.auth) throw new UnauthorizedError('Not signed in')
   return req.auth.userId
}
const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}

/** Household-scoped management; mounted under /api/households/:hid/invitations (membership checked). */
export function createHouseholdInvitationRoutes(invitations: InvitationService) {
   const router = Router({ mergeParams: true })
   router.get('/', async (req, res) => {
      res.json(await invitations.list(me(req), new Date()))
   })
   router.post('/', async (req, res) => {
      const input = createInvitationSchema.parse(req.body)
      res.status(201).json(await invitations.create(me(req), input, new Date()))
   })
   router.post('/:iid/resend', async (req, res) => {
      res.json(await invitations.resend(me(req), String(req.params.iid), new Date()))
   })
   router.delete('/:iid', async (req, res) => {
      await invitations.revoke(me(req), String(req.params.iid), new Date())
      res.status(204).end()
   })
   return router
}

/** Invitee side; mounted at /api/invitations. Only the preview works without a session. */
export function createInvitationRoutes(
   invitations: InvitationService,
   requireSession: (req: Request, res: Response, next: NextFunction) => Promise<void>,
   tokenLimit: number,
) {
   const router = Router()
   const limiter = rateLimit({
      windowMs: 15 * 60_000,
      limit: tokenLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new TooManyRequestsError('Too many requests. Please wait a few minutes.', 900)),
   })

   router.get('/preview', limiter, async (req, res) => {
      const { token } = tokenSchema.parse({ token: req.query.token })
      res.json(await invitations.preview(token, new Date()))
   })

   router.use(requireSession)
   router.get('/mine', async (req, res) => {
      res.json(await invitations.mine(userId(req), new Date()))
   })
   router.post('/accept', limiter, async (req, res) => {
      const { token } = tokenSchema.parse(req.body)
      res.json(await invitations.acceptByToken(userId(req), token, new Date()))
   })
   router.post('/:iid/accept', async (req, res) => {
      res.json(await invitations.acceptById(userId(req), String(req.params.iid), new Date()))
   })
   router.post('/:iid/decline', async (req, res) => {
      await invitations.decline(userId(req), String(req.params.iid), new Date())
      res.status(204).end()
   })
   return router
}
