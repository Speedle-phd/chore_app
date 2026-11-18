import { Router, type Request, type RequestHandler } from 'express'
import { NotFoundError, UnauthorizedError } from '../errors'
import type { MembershipType } from '../models/membershipModel'
import { guestContentSchema, linkInputSchema, linkPatchSchema, tokenParamsSchema } from './guestSchemas'
import type { GuestService } from './guestService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const linkId = (req: Request) => String(req.params.id)

/** Mounted under /api/households/:hid/guest (membership checked). */
export function createHouseholdGuestRoutes(guest: GuestService) {
   const router = Router({ mergeParams: true })

   router.get('/', async (req, res) => {
      res.json(await guest.getInfo(me(req)))
   })
   router.put('/', async (req, res) => {
      res.json(await guest.saveInfo(me(req), guestContentSchema.parse(req.body)))
   })

   router.get('/links', async (req, res) => {
      res.json(await guest.listLinks(me(req), new Date()))
   })
   /** The response is the only time the link's address is shown. */
   router.post('/links', async (req, res) => {
      res.status(201).json(await guest.createLink(me(req), linkInputSchema.parse(req.body), new Date()))
   })
   router.patch('/links/:id', async (req, res) => {
      res.json(await guest.updateLink(me(req), linkId(req), linkPatchSchema.parse(req.body), new Date()))
   })
   router.post('/links/:id/replace', async (req, res) => {
      res.json(await guest.replaceLink(me(req), linkId(req), new Date()))
   })
   router.delete('/links/:id', async (req, res) => {
      await guest.removeLink(me(req), linkId(req))
      res.status(204).end()
   })

   return router
}

/** Public `GET /api/guest/<token>` (no session; the token is the key). */
export function createGuestPageRoutes(guest: GuestService, limit: RequestHandler) {
   const router = Router()
   router.get('/:token', limit, async (req, res) => {
      res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' })
      const params = tokenParamsSchema.safeParse(req.params)
      if (!params.success) throw new NotFoundError('This link doesn’t work (any more).')
      res.json(await guest.page(params.data.token, new Date()))
   })
   return router
}
