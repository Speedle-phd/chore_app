import { Router, type Request } from 'express'
import { UnauthorizedError } from '../errors'
import type { MembershipType } from '../models/membershipModel'
import { messageInputSchema, pageQuerySchema, reactionSchema, readSchema } from './chatSchemas'
import type { ChatService } from './chatService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const param = (req: Request, name: string) => String(req.params[name])

/** Mounted under /api/households/:hid/chat (membership checked). */
export function createChatRoutes(chat: ChatService) {
   const router = Router({ mergeParams: true })

   router.get('/messages', async (req, res) => {
      res.json(await chat.page(me(req), pageQuerySchema.parse(req.query)))
   })
   router.post('/messages', async (req, res) => {
      res.status(201).json(await chat.send(me(req), messageInputSchema.parse(req.body).text))
   })
   router.patch('/messages/:id', async (req, res) => {
      res.json(await chat.edit(me(req), param(req, 'id'), messageInputSchema.parse(req.body).text, new Date()))
   })
   router.delete('/messages/:id', async (req, res) => {
      res.json(await chat.remove(me(req), param(req, 'id'), new Date()))
   })
   router.post('/messages/:id/reactions', async (req, res) => {
      res.json(await chat.react(me(req), param(req, 'id'), reactionSchema.parse(req.body).emoji, new Date()))
   })
   router.get('/unread', async (req, res) => {
      res.json(await chat.unread(me(req)))
   })
   router.post('/read', async (req, res) => {
      res.json(await chat.markRead(me(req), readSchema.parse(req.body).upTo))
   })

   return router
}
