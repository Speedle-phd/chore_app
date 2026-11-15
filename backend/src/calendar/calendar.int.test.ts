import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { seriesSpan } from '../domain/recurrence'
import { CalendarItem, type CalendarKind } from '../models/calendarItemModel'
import { Membership } from '../models/membershipModel'
import { Occurrence } from '../models/occurrenceModel'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

let app: ReturnType<typeof createApp>
beforeAll(() => {
   app = createApp(
      loadEnv({
         NODE_ENV: 'test',
         MONGODB_URI: 'set-by-useTestDatabase',
         MAILER_KEY: 'k'.repeat(32),
         AVATAR_UPLOAD_DIR: 'unused',
      }),
      {
         sendMail: async () => undefined,
         isBreached: async () => false,
         rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
      },
   )
})

const H = { 'X-Requested-With': 'fetch' }
const get = (cookie: string, url: string, query: Record<string, string>) =>
   request(app).get(url).query(query).set('Cookie', cookie)

async function household() {
   const owner = await signedInUser(app, 'Owner')
   const res = await request(app).post('/api/households').set(H).set('Cookie', owner.cookie).send({ name: 'Home' })
   const hid: string = res.body.id
   const mid = (await Membership.findOne({ householdId: hid, userId: owner.user._id }))?.id as string
   return { cookie: owner.cookie, hid, mid, url: `/api/households/${hid}/calendar` }
}

type Seed = {
   kind?: CalendarKind
   title: string
   allDay?: boolean
   start: string
   end: string
   rrule?: string
   memberIds?: string[]
}
/** Stores an item the way the write path will (phase 2): derived range from the domain. */
async function seed(hid: string, createdBy: string, s: Seed) {
   const timing = {
      allDay: s.allDay ?? false,
      start: s.start,
      end: s.end,
      timezone: 'Europe/Berlin',
      rrule: s.rrule ?? null,
      exdates: [],
   }
   const span = seriesSpan(timing)
   return CalendarItem.create({
      householdId: hid,
      createdBy,
      kind: s.kind ?? 'chore',
      title: s.title,
      allDay: timing.allDay,
      start: s.start,
      end: s.end,
      timezone: timing.timezone,
      memberIds: s.memberIds ?? [],
      recurrence: { rrule: timing.rrule, exdates: [] },
      rangeStart: span.from,
      rangeEnd: span.to,
   })
}

const MARCH = { from: '2026-03-23T00:00:00+01:00', to: '2026-04-06T00:00:00+02:00', tz: 'Europe/Berlin' }

describe('GET /api/households/:hid/calendar', () => {
   it('is a 404 for non-members and a 401 when signed out', async () => {
      const { url } = await household()
      const stranger = await signedInUser(app, 'Stranger')
      expect((await get(stranger.cookie, url, MARCH)).status).toBe(404)
      expect((await request(app).get(url).query(MARCH)).status).toBe(401)
   })

   it.each([
      ['missing tz', { from: MARCH.from, to: MARCH.to }],
      ['unknown tz', { ...MARCH, tz: 'Mars/Olympus' }],
      ['from after to', { ...MARCH, from: MARCH.to, to: MARCH.from }],
      ['window too long', { ...MARCH, to: '2027-06-01T00:00:00Z' }],
      ['date without offset', { ...MARCH, from: '2026-03-23T00:00:00' }],
      ['unknown kind', { ...MARCH, kinds: 'chore,party' }],
      ['bad member id', { ...MARCH, memberIds: 'nope' }],
   ])('rejects %s with 400', async (_name, query) => {
      const { cookie, url } = await household()
      const res = await get(cookie, url, query)
      expect(res.status).toBe(400)
   })

   it('returns one-off and repeating items expanded, with overrides applied', async () => {
      const { cookie, hid, mid, url } = await household()
      const weekly = await seed(hid, mid, {
         title: 'Bins out',
         start: '2026-03-16T19:00',
         end: '2026-03-16T19:15',
         rrule: 'FREQ=WEEKLY',
         memberIds: [mid],
      })
      await seed(hid, mid, { kind: 'event', title: 'Dentist', start: '2026-03-25T10:00', end: '2026-03-25T11:00' })
      await seed(hid, mid, { kind: 'birthday', title: 'Oma', allDay: true, start: '2026-03-28', end: '2026-03-29', rrule: 'FREQ=YEARLY' })
      // Out of the window entirely: ended long before.
      await seed(hid, mid, { title: 'Old', start: '2025-01-01T09:00', end: '2025-01-01T10:00', rrule: 'FREQ=DAILY;COUNT=3' })
      await Occurrence.create({ householdId: hid, itemId: weekly._id, originalStart: '2026-03-30T19:00', start: '2026-03-31T20:00' })

      const res = await get(cookie, url, MARCH)
      expect(res.status).toBe(200)
      const rows = res.body.map((i: Record<string, unknown>) => [i.title, i.start, i.end])
      expect(rows).toEqual(
         expect.arrayContaining([
            ['Bins out', '2026-03-23T19:00:00+01:00', '2026-03-23T19:15:00+01:00'],
            ['Bins out', '2026-03-31T20:00:00+02:00', '2026-03-31T20:15:00+02:00'],
            ['Dentist', '2026-03-25T10:00:00+01:00', '2026-03-25T11:00:00+01:00'],
            ['Oma', '2026-03-28', '2026-03-29'],
         ]),
      )
      expect(rows).toHaveLength(4)

      const moved = res.body.find((i: { originalStart: string }) => i.originalStart === '2026-03-30T19:00')
      expect(moved).toEqual({
         id: `${weekly.id}_2026-03-30T19:00`,
         itemId: weekly.id,
         kind: 'chore',
         title: 'Bins out',
         notes: '',
         color: null,
         allDay: false,
         start: '2026-03-31T20:00:00+02:00',
         end: '2026-03-31T20:15:00+02:00',
         originalStart: '2026-03-30T19:00',
         memberIds: [mid],
         createdBy: mid,
         recurring: true,
         overridden: true,
         // March 2026 has passed and nobody marked it.
         chore: {
            effort: 1,
            assignmentMode: 'anyone',
            rotation: false,
            afterDays: null,
            state: 'open',
            overdue: true,
            completions: [],
            conflict: null,
         },
         source: 'entry',
         age: null,
      })
   })

   it('filters by kind and by member (including reassigned occurrences)', async () => {
      const { cookie, hid, mid, url } = await household()
      const profile = await Membership.create({ householdId: hid, role: 'member', profile: { fname: 'Kid', lname: 'One' } })
      const weekly = await seed(hid, mid, {
         title: 'Dishes',
         start: '2026-03-23T18:00',
         end: '2026-03-23T18:30',
         rrule: 'FREQ=WEEKLY',
         memberIds: [mid],
      })
      await seed(hid, mid, { kind: 'event', title: 'Party', start: '2026-03-27T18:00', end: '2026-03-27T23:00' })
      await Occurrence.create({
         householdId: hid,
         itemId: weekly._id,
         originalStart: '2026-03-30T18:00',
         memberIds: [profile._id],
      })

      const events = await get(cookie, url, { ...MARCH, kinds: 'event' })
      expect(events.body.map((i: { title: string }) => i.title)).toEqual(['Party'])

      const kid = await get(cookie, url, { ...MARCH, memberIds: profile.id })
      expect(kid.body.map((i: { start: string }) => i.start)).toEqual(['2026-03-30T18:00:00+02:00'])
   })

   it('never shows another household’s items', async () => {
      const mine = await household()
      const theirs = await household()
      await seed(theirs.hid, theirs.mid, { title: 'Secret', start: '2026-03-24T09:00', end: '2026-03-24T10:00' })
      expect((await get(mine.cookie, mine.url, MARCH)).body).toEqual([])
   })

   it('deleting the household deletes its calendar', async () => {
      const { cookie, hid, mid } = await household()
      const item = await seed(hid, mid, { title: 'Water plants', start: '2026-03-24T09:00', end: '2026-03-24T09:10', rrule: 'FREQ=DAILY' })
      await Occurrence.create({ householdId: hid, itemId: item._id, originalStart: '2026-03-25T09:00', cancelled: true })
      const res = await request(app).delete(`/api/households/${hid}`).set(H).set('Cookie', cookie)
      expect(res.status).toBe(204)
      expect(await CalendarItem.countDocuments({ householdId: hid })).toBe(0)
      expect(await Occurrence.countDocuments({ householdId: hid })).toBe(0)
   })
})
