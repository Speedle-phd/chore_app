import { Router, type Request } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { isTimeZone } from '../domain/recurrence'
import { MAX_LEAD_DAYS } from '../domain/reminders'
import { UnauthorizedError } from '../errors'
import type { MembershipType } from '../models/membershipModel'
import type { ReminderService } from './reminderService'

const objectId = z.string().refine(isValidObjectId, 'Invalid id.')

export const reminderInputSchema = z.object({
   target: z.discriminatedUnion('type', [
      z.object({ type: z.literal('item'), itemId: objectId }),
      z.object({ type: z.literal('member'), memberId: objectId }),
      z.object({ type: z.literal('allBirthdays') }),
   ]),
   leadDays: z
      .array(z.number().int().min(0).max(MAX_LEAD_DAYS))
      .min(1, 'Pick when to be reminded.')
      .max(3)
      .refine((d) => new Set(d).size === d.length, 'Each time only once.'),
})

const upcomingQuerySchema = z.object({
   tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone.'),
   days: z.coerce.number().int().min(1).max(60).default(30),
})

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}

/** Mounted under /api/households/:hid/reminders (membership checked). Your own subscriptions only. */
export function createReminderRoutes(reminders: ReminderService) {
   const router = Router({ mergeParams: true })
   router.get('/', async (req, res) => {
      res.json(await reminders.list(me(req)))
   })
   router.get('/upcoming', async (req, res) => {
      const { tz, days } = upcomingQuerySchema.parse(req.query)
      res.json(await reminders.upcoming(me(req), tz, new Date(), days))
   })
   router.put('/', async (req, res) => {
      res.json(await reminders.save(me(req), reminderInputSchema.parse(req.body)))
   })
   router.delete('/:id', async (req, res) => {
      await reminders.remove(me(req), String(req.params.id))
      res.status(204).end()
   })
   return router
}
