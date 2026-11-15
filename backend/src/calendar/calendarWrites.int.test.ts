import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { CalendarItem } from '../models/calendarItemModel'
import { Membership, type Role } from '../models/membershipModel'
import { Occurrence } from '../models/occurrenceModel'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

let app: ReturnType<typeof createApp>
let notices: ReturnType<typeof vi.spyOn>
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
   notices = vi.spyOn(realtime, 'householdChanged')
})
afterEach(() => notices.mockClear())

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', cookie),
   post: (url: string, body: object) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

const MARCH = { from: '2026-03-23T00:00:00+01:00', to: '2026-04-06T00:00:00+02:00', tz: 'Europe/Berlin' }
const LONGER = { ...MARCH, to: '2026-04-20T00:00:00+02:00' }

async function home() {
   const ownerUser = await signedInUser(app, 'Owner')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const mid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))?.id as string
   const base = `/api/households/${hid}`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      const m = await Membership.create({ householdId: hid, userId: person.user._id, role })
      return { cookie: person.cookie, mid: m.id as string }
   }
   const titles = async (query = MARCH) =>
      ((await owner.get(`${base}/calendar`, query)).body as { title: string; start: string }[]).map(
         (i) => `${i.title} ${i.start}`,
      )
   notices.mockClear()
   return { hid, mid, owner, items: `${base}/calendar-items`, join, titles }
}

const bins = (over: object = {}) => ({
   kind: 'chore',
   title: 'Bins',
   allDay: false,
   start: '2026-03-23T19:00',
   end: '2026-03-23T19:15',
   timezone: 'Europe/Berlin',
   rrule: 'FREQ=WEEKLY',
   ...over,
})
const occ = (items: string, id: string, key: string, scope?: string) =>
   `${items}/${id}/occurrences/${encodeURIComponent(key)}${scope ? `?scope=${scope}` : ''}`

describe('creating and editing entries', () => {
   it('creates an entry, stores the derived range, and notifies the household', async () => {
      const { owner, items, hid, mid, titles } = await home()
      const res = await owner.post(items, bins({ memberIds: [mid], notes: '  green bin  ' }))
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
         kind: 'chore',
         title: 'Bins',
         notes: 'green bin',
         start: '2026-03-23T19:00',
         rrule: 'FREQ=WEEKLY',
         memberIds: [mid],
         createdBy: mid,
         exdates: [],
      })
      const stored = await CalendarItem.findById(res.body.id).lean()
      expect(stored?.rangeStart).toEqual(new Date('2026-03-23T18:00:00Z'))
      expect(stored?.rangeEnd).toBeNull()
      expect(notices).toHaveBeenCalledTimes(1)
      expect(notices.mock.calls[0]?.map(String)).toEqual([hid, 'calendar'])
      expect(await titles()).toEqual(['Bins 2026-03-23T19:00:00+01:00', 'Bins 2026-03-30T19:00:00+02:00'])
   })

   it.each([
      ['an empty title', { title: '  ' }],
      ['an hourly repeat', { rrule: 'FREQ=HOURLY' }],
      ['a broken repeat', { rrule: 'FREQ=WEEKLY;BYDAY=XX' }],
      ['an end before the start', { end: '2026-03-23T18:00' }],
      ['a time on an all-day entry', { allDay: true }],
      ['an impossible date', { start: '2026-02-30T10:00', end: '2026-02-30T11:00' }],
      ['an unknown zone', { timezone: 'Mars/Olympus' }],
      ['a too long entry', { allDay: true, start: '2026-01-01', end: '2027-06-01' }],
      ['the same person twice', { memberIds: ['64b000000000000000000001', '64b000000000000000000001'] }],
   ])('rejects %s with 400 and sends no notice', async (_name, over) => {
      const { owner, items } = await home()
      expect((await owner.post(items, bins(over))).status).toBe(400)
      expect(notices).not.toHaveBeenCalled()
   })

   it('rejects people from another household', async () => {
      const { owner, items } = await home()
      const other = await home()
      const res = await owner.post(items, bins({ memberIds: [other.mid] }))
      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Pick people from this household.')
   })

   it('is a 404 for strangers and for another household’s entry', async () => {
      const mine = await home()
      const theirs = await home()
      const entry = (await theirs.owner.post(theirs.items, bins())).body
      const stranger = await signedInUser(app, 'Stranger')
      expect((await as(stranger.cookie).post(mine.items, bins())).status).toBe(404)
      expect((await mine.owner.get(`${mine.items}/${entry.id}`)).status).toBe(404)
      expect((await mine.owner.put(`${mine.items}/${entry.id}`, bins())).status).toBe(404)
      expect((await mine.owner.del(`${mine.items}/${entry.id}`)).status).toBe(404)
      expect((await mine.owner.patch(occ(mine.items, entry.id, '2026-03-23T19:00'), { start: '2026-03-24' })).status).toBe(404)
      expect((await mine.owner.get(`${mine.items}/not-an-id`)).status).toBe(404)
      expect(await CalendarItem.countDocuments({ _id: entry.id })).toBe(1)
   })

   it('keeps single-occurrence changes when only details change, drops them when timing changes', async () => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, bins())).body
      await owner.patch(occ(items, entry.id, '2026-03-30T19:00', 'this'), { start: '2026-03-31T20:00:00+02:00' })
      await owner.del(occ(items, entry.id, '2026-04-06T19:00', 'this'))

      const renamed = await owner.put(`${items}/${entry.id}`, bins({ title: 'Bins (green)' }))
      expect(renamed.status).toBe(200)
      expect(renamed.body.exdates).toEqual(['2026-04-06T19:00'])
      expect(await Occurrence.countDocuments({ itemId: entry.id })).toBe(1)

      const moved = await owner.put(`${items}/${entry.id}`, bins({ start: '2026-03-24T19:00', end: '2026-03-24T19:15' }))
      expect(moved.body.exdates).toEqual([])
      expect(await Occurrence.countDocuments({ itemId: entry.id })).toBe(0)
   })
})

describe('deleting', () => {
   it('lets the creator and admins delete a series, not other members', async () => {
      const { owner, items, join } = await home()
      const member = await join('member')
      const admin = await join('admin')
      const ownersEntry = (await owner.post(items, bins())).body
      const membersEntry = (await as(member.cookie).post(items, bins())).body

      const denied = await as(member.cookie).del(`${items}/${ownersEntry.id}`)
      expect(denied.status).toBe(403)
      expect(await CalendarItem.countDocuments({ _id: ownersEntry.id })).toBe(1)

      expect((await as(member.cookie).del(`${items}/${membersEntry.id}`)).status).toBe(204)
      expect((await as(admin.cookie).del(`${items}/${ownersEntry.id}`)).status).toBe(204)
      expect(await CalendarItem.countDocuments({ _id: { $in: [ownersEntry.id, membersEntry.id] } })).toBe(0)
   })

   it('skips one occurrence (any member) and ends the series from one on (creator/admin)', async () => {
      const { owner, items, join, titles } = await home()
      const member = await join('member')
      const entry = (await owner.post(items, bins())).body

      expect((await as(member.cookie).del(occ(items, entry.id, '2026-03-30T19:00', 'this'))).status).toBe(204)
      expect(await titles()).toEqual(['Bins 2026-03-23T19:00:00+01:00'])

      expect((await as(member.cookie).del(occ(items, entry.id, '2026-04-06T19:00', 'following'))).status).toBe(403)
      expect((await owner.del(occ(items, entry.id, '2026-04-06T19:00', 'following'))).status).toBe(204)
      // The rule ends with the (skipped) 30th; the skip stays, so only the 23rd remains.
      const stored = await CalendarItem.findById(entry.id).lean()
      expect(stored?.recurrence.rrule).toBe('FREQ=WEEKLY;UNTIL=20260330T170000Z')
      expect(stored?.recurrence.exdates).toEqual(['2026-03-30T19:00'])
      expect(await titles({ ...MARCH, to: '2026-05-01T00:00:00+02:00' })).toEqual(['Bins 2026-03-23T19:00:00+01:00'])
   })

   it('is a 404 for a date that is not an occurrence', async () => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, bins())).body
      expect((await owner.del(occ(items, entry.id, '2026-03-24T19:00', 'this'))).status).toBe(404)
      expect((await owner.patch(occ(items, entry.id, 'garbage'), { start: '2026-03-24T19:00:00+01:00' })).status).toBe(404)
   })
})

describe('changing occurrences', () => {
   it('this: moves one occurrence and keeps its length', async () => {
      const { owner, items, titles } = await home()
      const entry = (await owner.post(items, bins())).body
      const res = await owner.patch(occ(items, entry.id, '2026-03-30T19:00', 'this'), { start: '2026-03-31T20:00:00+02:00' })
      expect(res.status).toBe(204)
      expect(await titles(LONGER)).toEqual([
         'Bins 2026-03-23T19:00:00+01:00',
         'Bins 2026-03-31T20:00:00+02:00',
         'Bins 2026-04-06T19:00:00+02:00',
         'Bins 2026-04-13T19:00:00+02:00',
      ])
      expect(await Occurrence.findOne({ itemId: entry.id }).lean()).toMatchObject({ start: '2026-03-31T20:00', end: null })
      expect(notices).toHaveBeenCalledWith(expect.anything(), 'calendar')
   })

   it('this: reassigning stores the people, not the times', async () => {
      const { owner, items, join } = await home()
      const member = await join('member')
      const entry = (await owner.post(items, bins())).body
      await owner.patch(occ(items, entry.id, '2026-03-30T19:00', 'this'), { memberIds: [member.mid] })
      const stored = await Occurrence.findOne({ itemId: entry.id }).lean()
      expect(stored).toMatchObject({ start: null, end: null })
      expect(stored?.memberIds?.map(String)).toEqual([member.mid])
   })

   it('following: splits the series; the new part starts at the moved time and keeps the count', async () => {
      const { owner, items, titles, hid } = await home()
      const entry = (await owner.post(items, bins({ rrule: 'FREQ=WEEKLY;COUNT=4' }))).body
      const res = await owner.patch(occ(items, entry.id, '2026-04-06T19:00', 'following'), {
         start: '2026-04-06T18:00:00+02:00',
         end: '2026-04-06T18:30:00+02:00',
      })
      expect(res.status).toBe(204)
      expect(await titles(LONGER)).toEqual([
         'Bins 2026-03-23T19:00:00+01:00',
         'Bins 2026-03-30T19:00:00+02:00',
         'Bins 2026-04-06T18:00:00+02:00',
         'Bins 2026-04-13T18:00:00+02:00',
      ])
      const stored = await CalendarItem.find({ householdId: hid }).sort({ start: 1 }).lean()
      expect(stored.map((i) => [i.start, i.end, i.recurrence.rrule])).toEqual([
         ['2026-03-23T19:00', '2026-03-23T19:15', 'FREQ=WEEKLY;UNTIL=20260330T170000Z'],
         ['2026-04-06T18:00', '2026-04-06T18:30', 'FREQ=WEEKLY;COUNT=2'],
      ])
      expect(stored[1]?.createdBy.toString()).toBe(entry.createdBy)
   })

   it('all: shifts the time of every occurrence; skipped dates move along', async () => {
      const { owner, items, titles } = await home()
      const entry = (await owner.post(items, bins())).body
      await owner.del(occ(items, entry.id, '2026-04-06T19:00', 'this'))
      await owner.patch(occ(items, entry.id, '2026-03-30T19:00', 'all'), { start: '2026-03-30T07:00:00+02:00' })
      expect(await titles(LONGER)).toEqual([
         'Bins 2026-03-23T07:00:00+01:00',
         'Bins 2026-03-30T07:00:00+02:00',
         'Bins 2026-04-13T07:00:00+02:00',
      ])
   })

   it('all: refuses to move the date of a series that repeats on set days, allows a new time', async () => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, bins({ rrule: 'FREQ=WEEKLY;BYDAY=MO' }))).body
      notices.mockClear()
      const res = await owner.patch(occ(items, entry.id, '2026-03-30T19:00', 'all'), { start: '2026-03-31T19:00:00+02:00' })
      expect(res.status).toBe(400)
      expect(notices).not.toHaveBeenCalled()
      const sameDay = await owner.patch(occ(items, entry.id, '2026-03-30T19:00', 'all'), { start: '2026-03-30T08:00:00+02:00' })
      expect(sameDay.status).toBe(204)
   })

   it('moves a one-off entry itself, also all-day ones (keeping their length)', async () => {
      const { owner, items, titles } = await home()
      const dentist = (await owner.post(items, bins({ kind: 'event', title: 'Dentist', rrule: null }))).body
      await owner.patch(occ(items, dentist.id, '2026-03-23T19:00'), {
         start: '2026-03-25T09:00:00+01:00',
         end: '2026-03-25T10:00:00+01:00',
      })
      const trip = (
         await owner.post(items, bins({ kind: 'vacation', title: 'Trip', allDay: true, start: '2026-03-27', end: '2026-03-29', rrule: null }))
      ).body
      await owner.patch(occ(items, trip.id, '2026-03-27'), { start: '2026-03-28' })
      expect(await titles()).toEqual(['Dentist 2026-03-25T09:00:00+01:00', 'Trip 2026-03-28'])
      expect((await CalendarItem.findById(trip.id).lean())?.end).toBe('2026-03-30')
   })

   it.each([
      ['a time for an all-day entry', { start: '2026-03-28T10:00:00+01:00' }],
      ['an end before the start', { end: '2026-03-26' }],
      ['nothing', {}],
   ])('rejects %s with 400', async (_name, body) => {
      const { owner, items } = await home()
      const trip = (await owner.post(items, bins({ allDay: true, start: '2026-03-27', end: '2026-03-29', rrule: null }))).body
      expect((await owner.patch(occ(items, trip.id, '2026-03-27'), body)).status).toBe(400)
   })
})
