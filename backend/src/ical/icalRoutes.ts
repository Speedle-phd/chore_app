import { Router, type Request, type RequestHandler } from 'express'
import { NotFoundError, UnauthorizedError } from '../errors'
import { icsUpload } from '../middleware/icsUpload'
import type { MembershipType } from '../models/membershipModel'
import { feedParamsSchema, feedScopeSchema, importPreviewSchema, importSchema } from './icalSchemas'
import type { IcalService } from './icalService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const fileText = (req: Request) => req.file?.buffer.toString('utf8') ?? ''

/** Mounted under /api/households/:hid/ical (membership checked). */
export function createHouseholdIcalRoutes(ical: IcalService) {
   const router = Router({ mergeParams: true })

   router.get('/feed', async (req, res) => {
      res.json(await ical.getFeed(me(req)))
   })
   /** Creates or replaces the link; the response is the only time it is shown. */
   router.post('/feed', async (req, res) => {
      const { scope } = feedScopeSchema.parse(req.body ?? {})
      res.status(201).json(await ical.createFeed(me(req), scope, new Date()))
   })
   router.patch('/feed', async (req, res) => {
      const { scope } = feedScopeSchema.parse(req.body)
      res.json(await ical.setFeedScope(me(req), scope))
   })
   router.delete('/feed', async (req, res) => {
      await ical.removeFeed(me(req))
      res.status(204).end()
   })

   router.post('/import/preview', icsUpload, async (req, res) => {
      const { kind, tz } = importPreviewSchema.parse(req.body)
      res.json({ entries: await ical.preview(me(req), fileText(req), kind, tz) })
   })
   router.post('/import', icsUpload, async (req, res) => {
      const { kind, tz, uids } = importSchema.parse(req.body)
      res.json(await ical.import(me(req), fileText(req), kind, tz, uids, new Date()))
   })

   return router
}

/** Public `GET /api/ical/<token>.ics` for calendar apps (no session; the token is the key). */
export function createFeedRoutes(ical: IcalService, limit: RequestHandler) {
   const router = Router()
   router.get('/:file', limit, async (req, res) => {
      const params = feedParamsSchema.safeParse(req.params)
      if (!params.success) throw new NotFoundError('Calendar not found')
      const text = await ical.feed(params.data.file, new Date())
      res
         .set({
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="hearth.ics"',
            'Cache-Control': 'private, max-age=300',
            'X-Robots-Tag': 'noindex',
         })
         .send(text)
   })
   return router
}
