import { Router, type Request } from 'express'
import { UnauthorizedError } from '../errors'
import type { MembershipType } from '../models/membershipModel'
import {
   calendarQuerySchema,
   changeScopeSchema,
   choresQuerySchema,
   itemListQuerySchema,
   deleteScopeSchema,
   itemInputSchema,
   occurrenceChangeSchema,
   occurrenceParamsSchema,
   statsQuerySchema,
   statusSchema,
} from './calendarSchemas'
import type { CalendarService } from './calendarService'
import type { StatsService } from './statsService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const itemId = (req: Request) => String(req.params.id)

/** Mounted under /api/households/:hid (membership checked): /calendar, /calendar-items, /chores. */
export function createCalendarRoutes(calendar: CalendarService, stats: StatsService) {
   const router = Router({ mergeParams: true })

   router.get('/calendar', async (req, res) => {
      res.json(await calendar.list(me(req), calendarQuerySchema.parse(req.query), new Date()))
   })
   router.get('/chores', async (req, res) => {
      const { tz } = choresQuerySchema.parse(req.query)
      res.json(await calendar.agenda(me(req), tz, new Date()))
   })

   router.get('/calendar-items', async (req, res) => {
      const { kind } = itemListQuerySchema.parse(req.query)
      res.json(await calendar.listItems(me(req), kind))
   })
   router.get('/stats', async (req, res) => {
      res.json(await stats.stats(me(req), statsQuerySchema.parse(req.query), new Date()))
   })
   router.get('/stats/members/:mid', async (req, res) => {
      res.json(await stats.member(me(req), String(req.params.mid), statsQuerySchema.parse(req.query), new Date()))
   })
   router.post('/calendar-items', async (req, res) => {
      res.status(201).json(await calendar.create(me(req), itemInputSchema.parse(req.body)))
   })
   router.get('/calendar-items/:id', async (req, res) => {
      res.json(await calendar.get(me(req), itemId(req)))
   })
   router.put('/calendar-items/:id', async (req, res) => {
      res.json(await calendar.update(me(req), itemId(req), itemInputSchema.parse(req.body)))
   })
   router.post('/calendar-items/:id/archive', async (req, res) => {
      res.json(await calendar.archive(me(req), itemId(req), new Date()))
   })
   router.post('/calendar-items/:id/restore', async (req, res) => {
      res.json(await calendar.restore(me(req), itemId(req), new Date()))
   })
   router.delete('/calendar-items/:id', async (req, res) => {
      await calendar.remove(me(req), itemId(req))
      res.status(204).end()
   })

   router.patch('/calendar-items/:id/occurrences/:originalStart', async (req, res) => {
      const { id, originalStart } = occurrenceParamsSchema.parse(req.params)
      const { scope } = changeScopeSchema.parse(req.query)
      await calendar.changeOccurrence(me(req), id, originalStart, scope, occurrenceChangeSchema.parse(req.body))
      res.status(204).end()
   })
   router.delete('/calendar-items/:id/occurrences/:originalStart', async (req, res) => {
      const { id, originalStart } = occurrenceParamsSchema.parse(req.params)
      const { scope } = deleteScopeSchema.parse(req.query)
      await calendar.removeOccurrence(me(req), id, originalStart, scope)
      res.status(204).end()
   })
   router.post('/calendar-items/:id/occurrences/:originalStart/status', async (req, res) => {
      const { id, originalStart } = occurrenceParamsSchema.parse(req.params)
      await calendar.setStatus(me(req), id, originalStart, statusSchema.parse(req.body), new Date())
      res.status(204).end()
   })

   return router
}
