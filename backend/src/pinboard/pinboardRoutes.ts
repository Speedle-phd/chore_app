import { Router, type Request } from 'express'
import { UnauthorizedError } from '../errors'
import type { MembershipType } from '../models/membershipModel'
import { postInputSchema, postUpdateSchema, readSchema, voteSchema } from './pinboardSchemas'
import type { PinboardService } from './pinboardService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const param = (req: Request, name: string) => String(req.params[name])

/** Mounted under /api/households/:hid/posts (membership checked). */
export function createPinboardRoutes(pinboard: PinboardService) {
   const router = Router({ mergeParams: true })

   router.get('/', async (req, res) => {
      res.json(await pinboard.list(me(req), new Date()))
   })
   router.get('/unread', async (req, res) => {
      res.json(await pinboard.unread(me(req), new Date()))
   })
   router.post('/read', async (req, res) => {
      res.json(await pinboard.markRead(me(req), readSchema.parse(req.body).upTo, new Date()))
   })
   router.post('/', async (req, res) => {
      res.status(201).json(await pinboard.create(me(req), postInputSchema.parse(req.body), new Date()))
   })
   router.patch('/:id', async (req, res) => {
      res.json(await pinboard.edit(me(req), param(req, 'id'), postUpdateSchema.parse(req.body).text, new Date()))
   })
   router.delete('/:id', async (req, res) => {
      await pinboard.remove(me(req), param(req, 'id'), new Date())
      res.status(204).end()
   })
   router.post('/:id/pin', async (req, res) => {
      res.json(await pinboard.pin(me(req), param(req, 'id'), true, new Date()))
   })
   router.post('/:id/unpin', async (req, res) => {
      res.json(await pinboard.pin(me(req), param(req, 'id'), false, new Date()))
   })
   router.post('/:id/close', async (req, res) => {
      res.json(await pinboard.close(me(req), param(req, 'id'), new Date()))
   })
   router.put('/:id/vote', async (req, res) => {
      res.json(await pinboard.vote(me(req), param(req, 'id'), voteSchema.parse(req.body), new Date()))
   })

   return router
}
