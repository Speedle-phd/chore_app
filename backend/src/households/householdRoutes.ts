import { Router, type Request } from 'express'
import { createCalendarRoutes } from '../calendar/calendarRoutes'
import { createStatsService } from '../calendar/statsService'
import type { CalendarService } from '../calendar/calendarService'
import { createReminderRoutes } from '../reminders/reminderRoutes'
import type { ReminderService } from '../reminders/reminderService'
import { createHouseholdInvitationRoutes } from '../invitations/invitationRoutes'
import type { InvitationService } from '../invitations/invitationService'
import { UnauthorizedError } from '../errors'
import upload from '../middleware/avatarUpload'
import type { MembershipType } from '../models/membershipModel'
import { householdNameSchema, motivationSchema, profileSchema, roleSchema } from './householdSchemas'
import type { HouseholdService } from './householdService'
import { requireMembership } from './requireMembership'

const userId = (req: Request) => {
   if (!req.auth) throw new UnauthorizedError('Not signed in')
   return req.auth.userId
}
const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const memberId = (req: Request) => String(req.params.mid)

/** Mounted at /api/households behind requireSession. */
export function createHouseholdRoutes(
   households: HouseholdService,
   invitations: InvitationService,
   calendar: CalendarService,
   reminders: ReminderService,
) {
   const router = Router()

   router.get('/', async (req, res) => {
      res.json(await households.listMine(userId(req)))
   })
   router.post('/', async (req, res) => {
      const { name } = householdNameSchema.parse(req.body)
      res.status(201).json(await households.create(userId(req), name))
   })

   // Everything below needs the caller to be a member of :hid.
   const one = Router({ mergeParams: true })
   router.use('/:hid', requireMembership, one)

   one.get('/', async (req, res) => {
      res.json(await households.get(me(req)))
   })
   one.patch('/', async (req, res) => {
      const { name } = householdNameSchema.parse(req.body)
      res.json(await households.rename(me(req), name))
   })
   one.patch('/motivation', async (req, res) => {
      res.json(await households.setMotivation(me(req), motivationSchema.parse(req.body)))
   })
   one.delete('/', async (req, res) => {
      await households.remove(me(req))
      res.status(204).end()
   })
   one.post('/select', async (req, res) => {
      await households.select(me(req))
      res.status(204).end()
   })
   one.post('/leave', async (req, res) => {
      await households.leave(me(req))
      res.status(204).end()
   })

   one.use('/invitations', createHouseholdInvitationRoutes(invitations))
   one.use(createCalendarRoutes(calendar, createStatsService(calendar)))
   one.use('/reminders', createReminderRoutes(reminders))

   one.get('/members', async (req, res) => {
      res.json(await households.listMembers(me(req)))
   })
   one.patch('/members/:mid', async (req, res) => {
      const { role } = roleSchema.parse(req.body)
      await households.changeRole(me(req), memberId(req), role)
      res.status(204).end()
   })
   one.delete('/members/:mid', async (req, res) => {
      await households.removeMember(me(req), memberId(req))
      res.status(204).end()
   })

   one.post('/profiles', upload.single('avatar'), async (req, res) => {
      const input = profileSchema.parse(req.body)
      res.status(201).json(await households.createProfile(me(req), input, req.file?.buffer))
   })
   one.put('/profiles/:mid', upload.single('avatar'), async (req, res) => {
      const input = profileSchema.parse(req.body)
      res.json(await households.updateProfile(me(req), memberId(req), input, req.file?.buffer))
   })

   return router
}
