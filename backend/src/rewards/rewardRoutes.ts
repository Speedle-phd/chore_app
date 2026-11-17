import { Router, type Request } from 'express'
import type { RedemptionAction } from '../domain/rewards'
import { UnauthorizedError } from '../errors'
import type { MembershipType } from '../models/membershipModel'
import { decisionSchema, memberParamSchema, redeemSchema, rewardInputSchema, rewardUpdateSchema } from './rewardSchemas'
import type { RewardService } from './rewardService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const param = (req: Request, name: string) => String(req.params[name])
const ACTIONS: RedemptionAction[] = ['approve', 'decline', 'cancel', 'refund']

/** Mounted under /api/households/:hid/rewards (membership checked). */
export function createRewardRoutes(rewards: RewardService) {
   const router = Router({ mergeParams: true })

   router.get('/', async (req, res) => {
      res.json(await rewards.overview(me(req), new Date()))
   })
   router.post('/', async (req, res) => {
      res.status(201).json(await rewards.create(me(req), rewardInputSchema.parse(req.body)))
   })
   router.get('/members/:mid', async (req, res) => {
      const { mid } = memberParamSchema.parse(req.params)
      res.json(await rewards.member(me(req), mid, new Date()))
   })
   for (const action of ACTIONS) {
      router.post(`/redemptions/:id/${action}`, async (req, res) => {
         const { note } = decisionSchema.parse(req.body ?? {})
         res.json(await rewards.decide(me(req), param(req, 'id'), action, note, new Date()))
      })
   }
   router.patch('/:id', async (req, res) => {
      res.json(await rewards.update(me(req), param(req, 'id'), rewardUpdateSchema.parse(req.body)))
   })
   router.post('/:id/archive', async (req, res) => {
      res.json(await rewards.archive(me(req), param(req, 'id'), true))
   })
   router.post('/:id/restore', async (req, res) => {
      res.json(await rewards.archive(me(req), param(req, 'id'), false))
   })
   router.delete('/:id', async (req, res) => {
      await rewards.remove(me(req), param(req, 'id'))
      res.status(204).end()
   })
   router.post('/:id/redeem', async (req, res) => {
      const { memberId } = redeemSchema.parse(req.body ?? {})
      res.status(201).json(await rewards.redeem(me(req), param(req, 'id'), memberId, new Date()))
   })

   return router
}
