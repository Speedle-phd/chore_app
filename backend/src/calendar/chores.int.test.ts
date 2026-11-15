import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { CalendarItem } from '../models/calendarItemModel'
import { Membership, type Role } from '../models/membershipModel'
import { Occurrence } from '../models/occurrenceModel'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

// "Now" is Wednesday 25 March 2026, 12:00 in Berlin (CET). Only Date is faked; timers run normally.
const NOW = new Date('2026-03-25T11:00:00Z')

let app: ReturnType<typeof createApp>
let notices: ReturnType<typeof vi.spyOn>
beforeAll(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: NOW })
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
afterAll(() => vi.useRealTimers())
afterEach(() => {
   notices.mockClear()
   vi.setSystemTime(NOW)
})

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', cookie),
   post: (url: string, body: object) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

const TZ = 'Europe/Berlin'
const WEEK = { from: '2026-03-23T00:00:00+01:00', to: '2026-04-20T00:00:00+02:00', tz: TZ }

type View = {
   title: string
   originalStart: string
   start: string
   memberIds: string[]
   chore: { state: string; overdue: boolean; completions: { memberId: string; status: string; by: string }[] } | null
}

async function home() {
   const ownerUser = await signedInUser(app, 'Owner')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const mid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))?.id as string
   const base = `/api/households/${hid}`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      const m = await Membership.create({ householdId: hid, userId: person.user._id, role })
      return { cookie: person.cookie, mid: m.id as string, as: as(person.cookie) }
   }
   const profile = async (fname: string) =>
      (await Membership.create({ householdId: hid, role: 'member', profile: { fname, lname: 'Kid' } })).id as string
   const list = async (query = WEEK): Promise<View[]> => (await owner.get(`${base}/calendar`, query)).body
   const find = async (originalStart: string) => (await list()).find((i) => i.originalStart === originalStart)
   notices.mockClear()
   return { hid, mid, owner, base, items: `${base}/calendar-items`, join, profile, list, find }
}

const chore = (over: object = {}) => ({
   kind: 'chore',
   title: 'Dishes',
   allDay: false,
   start: '2026-03-23T19:00',
   end: '2026-03-23T19:30',
   timezone: TZ,
   rrule: 'FREQ=DAILY',
   ...over,
})
const occ = (items: string, id: string, key: string, scope?: string) =>
   `${items}/${id}/occurrences/${encodeURIComponent(key)}${scope ? `?scope=${scope}` : ''}`
const status = (items: string, id: string, key: string) => `${occ(items, id, key)}/status`

describe('marking chores', () => {
   it('marks done for yourself; the occurrence is done and no longer overdue', async () => {
      const { owner, items, mid, find, hid } = await home()
      const entry = (await owner.post(items, chore({ memberIds: [mid] }))).body
      expect((await find('2026-03-24T19:00'))?.chore).toMatchObject({ state: 'open', overdue: true })

      notices.mockClear()
      const res = await owner.post(status(items, entry.id, '2026-03-24T19:00'), { status: 'done', note: 'sparkling' })
      expect(res.status).toBe(204)
      expect((await find('2026-03-24T19:00'))?.chore).toMatchObject({
         state: 'done',
         overdue: false,
         completions: [{ memberId: mid, status: 'done', by: mid, note: 'sparkling', at: NOW.toISOString() }],
      })
      expect(notices.mock.calls[0]?.map(String)).toEqual([hid, 'calendar'])
   })

   it('undoes with “open” and removes the empty record', async () => {
      const { owner, items, find } = await home()
      const entry = (await owner.post(items, chore())).body
      await owner.post(status(items, entry.id, '2026-03-24T19:00'), { status: 'done' })
      await owner.post(status(items, entry.id, '2026-03-24T19:00'), { status: 'open' })
      expect((await find('2026-03-24T19:00'))?.chore?.state).toBe('open')
      expect(await Occurrence.countDocuments({ itemId: entry.id })).toBe(0)
   })

   it('keeps a moved occurrence’s time when its completion is undone', async () => {
      const { owner, items, find } = await home()
      const entry = (await owner.post(items, chore())).body
      await owner.patch(occ(items, entry.id, '2026-03-25T19:00', 'this'), { start: '2026-03-25T20:00:00+01:00' })
      await owner.post(status(items, entry.id, '2026-03-25T19:00'), { status: 'done' })
      await owner.post(status(items, entry.id, '2026-03-25T19:00'), { status: 'open' })
      const doc = await Occurrence.findOne({ itemId: entry.id, originalStart: '2026-03-25T19:00' }).lean()
      expect(doc?.completions).toEqual([])
      expect((await find('2026-03-25T19:00'))?.start).toBe('2026-03-25T20:00:00+01:00')
   })

   it('“everyone”: partial until each assignee is done; non-assignees are refused', async () => {
      const { owner, items, mid, join, find } = await home()
      const ben = await join('member')
      const outsider = await join('member')
      const entry = (await owner.post(items, chore({ memberIds: [mid, ben.mid], chore: { assignmentMode: 'everyone' } }))).body
      await owner.post(status(items, entry.id, '2026-03-24T19:00'), { status: 'done' })
      expect((await find('2026-03-24T19:00'))?.chore).toMatchObject({ state: 'partial', overdue: true })
      const refused = await outsider.as.post(status(items, entry.id, '2026-03-24T19:00'), { status: 'done' })
      expect(refused.status).toBe(400)
      await ben.as.post(status(items, entry.id, '2026-03-24T19:00'), { status: 'skipped' })
      expect((await find('2026-03-24T19:00'))?.chore).toMatchObject({ state: 'done', overdue: false })
   })

   it('who may mark for whom: profiles by anyone, other accounts by admins only', async () => {
      const { owner, items, join, profile, find } = await home()
      const ben = await join('member')
      const cara = await join('member')
      const kid = await profile('Mia')
      const entry = (await owner.post(items, chore({ memberIds: [kid, ben.mid] }))).body

      expect((await cara.as.post(status(items, entry.id, '2026-03-24T19:00'), { status: 'done', memberId: kid })).status).toBe(204)
      expect((await find('2026-03-24T19:00'))?.chore?.completions).toEqual([
         expect.objectContaining({ memberId: kid, by: cara.mid }),
      ])
      const denied = await cara.as.post(status(items, entry.id, '2026-03-23T19:00'), { status: 'done', memberId: ben.mid })
      expect(denied.status).toBe(403)
      expect((await owner.post(status(items, entry.id, '2026-03-23T19:00'), { status: 'done', memberId: ben.mid })).status).toBe(204)

      const other = await home()
      const stranger = await owner.post(status(items, entry.id, '2026-03-22T19:00'), { status: 'done', memberId: other.mid })
      expect(stranger.status).toBe(404) // the 22nd is before the series
      const foreign = await owner.post(status(items, entry.id, '2026-03-24T19:00'), { status: 'done', memberId: other.mid })
      expect(foreign.status).toBe(400)
   })

   it.each([
      ['an event', { kind: 'event' }, '2026-03-24T19:00', 400],
      ['more than 7 days ahead', {}, '2026-04-02T19:00', 400],
      ['a date that is not an occurrence', { rrule: 'FREQ=WEEKLY' }, '2026-03-24T19:00', 404],
   ])('refuses %s', async (_name, over, key, code) => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, chore(over))).body
      notices.mockClear()
      expect((await owner.post(status(items, entry.id, key), { status: 'done' })).status).toBe(code)
      expect(notices).not.toHaveBeenCalled()
   })

   it('is a 404 for strangers', async () => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, chore())).body
      const stranger = await signedInUser(app, 'Stranger')
      expect((await as(stranger.cookie).post(status(items, entry.id, '2026-03-24T19:00'), { status: 'done' })).status).toBe(404)
   })
})

describe('rotation', () => {
   it('takes turns by date; a skipped date doesn’t shift the turns', async () => {
      const { owner, items, mid, join, profile, list } = await home()
      const ben = await join('member')
      const kid = await profile('Mia')
      const entry = (await owner.post(items, chore({ memberIds: [mid, ben.mid, kid], chore: { rotation: true } }))).body
      await owner.del(occ(items, entry.id, '2026-03-24T19:00', 'this'))
      const turns = (await list({ ...WEEK, to: '2026-03-28T00:00:00+01:00' })).map((i) => [i.originalStart.slice(8, 10), i.memberIds])
      expect(turns).toEqual([
         ['23', [mid]],
         ['25', [kid]],
         ['26', [mid]],
         ['27', [ben.mid]],
      ])
   })

   it('continues the turns after “this and following”', async () => {
      const { owner, items, mid, join, list } = await home()
      const ben = await join('member')
      const entry = (await owner.post(items, chore({ memberIds: [mid, ben.mid], chore: { rotation: true } }))).body
      const split = await owner.patch(occ(items, entry.id, '2026-03-24T19:00', 'following'), { start: '2026-03-24T18:00:00+01:00' })
      expect(split.status).toBe(204)
      const turns = (await list({ ...WEEK, to: '2026-03-27T00:00:00+01:00' })).map((i) => [i.start.slice(8, 16), i.memberIds])
      expect(turns).toEqual([
         ['23T19:00', [mid]],
         ['24T18:00', [ben.mid]],
         ['25T18:00', [mid]],
         ['26T18:00', [ben.mid]],
      ])
   })

   it('rejects rotation with “everyone”', async () => {
      const { owner, items } = await home()
      const res = await owner.post(items, chore({ chore: { rotation: true, assignmentMode: 'everyone' } }))
      expect(res.status).toBe(400)
   })
})

describe('repeat after completion', () => {
   const plants = (over: object = {}) =>
      chore({ title: 'Water plants', rrule: null, afterDays: 3, start: '2026-03-24T09:00', end: '2026-03-24T09:15', ...over })

   it('schedules the next one N days after it was done, keeping the history', async () => {
      const { owner, items, list } = await home()
      const entry = (await owner.post(items, plants())).body
      expect((await owner.post(status(items, entry.id, '2026-03-24T09:00'), { status: 'done' })).status).toBe(204)
      expect((await CalendarItem.findById(entry.id).lean())?.start).toBe('2026-03-28T09:00')
      expect((await list()).map((i) => [i.originalStart, i.chore?.state])).toEqual([
         ['2026-03-24T09:00', 'done'],
         ['2026-03-28T09:00', 'open'],
      ])
   })

   it('a skip also schedules the next one', async () => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, plants())).body
      await owner.post(status(items, entry.id, '2026-03-24T09:00'), { status: 'skipped' })
      expect((await CalendarItem.findById(entry.id).lean())?.start).toBe('2026-03-28T09:00')
   })

   it('undoing the latest completion makes it the open one again; older ones can’t be undone', async () => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, plants())).body
      await owner.post(status(items, entry.id, '2026-03-24T09:00'), { status: 'done' })
      vi.setSystemTime(new Date('2026-03-28T10:00:00Z'))
      await owner.post(status(items, entry.id, '2026-03-28T09:00'), { status: 'done' })
      expect((await CalendarItem.findById(entry.id).lean())?.start).toBe('2026-03-31T09:00')

      const older = await owner.post(status(items, entry.id, '2026-03-24T09:00'), { status: 'open' })
      expect(older.status).toBe(409)
      expect((await owner.post(status(items, entry.id, '2026-03-28T09:00'), { status: 'open' })).status).toBe(204)
      expect((await CalendarItem.findById(entry.id).lean())?.start).toBe('2026-03-28T09:00')
   })

   it('can’t delete a single occurrence; moving the open one moves the chore', async () => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, plants())).body
      const del = await owner.del(occ(items, entry.id, '2026-03-24T09:00', 'this'))
      expect(del.status).toBe(400)
      const moved = await owner.patch(occ(items, entry.id, '2026-03-24T09:00'), { start: '2026-03-26T09:00:00+01:00' })
      expect(moved.status).toBe(204)
      expect((await CalendarItem.findById(entry.id).lean())?.start).toBe('2026-03-26T09:00')
   })

   it.each([
      ['together with a fixed repeat', { rrule: 'FREQ=DAILY' }],
      ['for an event', { kind: 'event' }],
   ])('rejects “after completion” %s', async (_name, over) => {
      const { owner, items } = await home()
      expect((await owner.post(items, plants(over))).status).toBe(400)
   })
})

describe('series edits keep the history', () => {
   it('changing the time keeps completed occurrences, drops other single changes', async () => {
      const { owner, items } = await home()
      const entry = (await owner.post(items, chore())).body
      await owner.post(status(items, entry.id, '2026-03-23T19:00'), { status: 'done' })
      await owner.del(occ(items, entry.id, '2026-03-24T19:00', 'this'))
      await owner.patch(occ(items, entry.id, '2026-03-26T19:00', 'this'), { start: '2026-03-26T21:00:00+01:00' })
      await owner.put(`${items}/${entry.id}`, chore({ start: '2026-03-23T20:00', end: '2026-03-23T20:30' }))
      const kept = await Occurrence.find({ itemId: entry.id }).lean()
      expect(kept.map((o) => o.originalStart)).toEqual(['2026-03-23T19:00'])
   })
})

describe('GET /calendar-items', () => {
   it('lists the household’s chores by title, only its own', async () => {
      const { owner, items } = await home()
      await owner.post(items, chore({ title: 'water plants' }))
      await owner.post(items, chore({ title: 'Bins' }))
      await owner.post(items, chore({ kind: 'event', title: 'Party', rrule: null }))
      const other = await home()
      await other.owner.post(other.items, chore({ title: 'Secret' }))
      const res = await owner.get(items, { kind: 'chore' })
      expect(res.body.map((i: { title: string }) => i.title)).toEqual(['Bins', 'water plants'])
      expect(res.body[0]).toMatchObject({ chore: { effort: 1, assignmentMode: 'anyone', rotation: false }, afterDays: null })
      expect((await owner.get(items, { kind: 'party' })).status).toBe(400)
   })
})

describe('GET /chores (agenda)', () => {
   it('splits into overdue, today and the next 7 days', async () => {
      const { owner, items, base } = await home()
      const daily = (await owner.post(items, chore({ title: 'Dishes' }))).body
      await owner.post(items, chore({ title: 'Bins', rrule: 'FREQ=WEEKLY', start: '2026-03-27T19:00', end: '2026-03-27T19:15' }))
      await owner.post(items, chore({ title: 'Old', rrule: null, start: '2026-01-02T10:00', end: '2026-01-02T11:00' }))
      await owner.post(items, chore({ kind: 'event', title: 'Party', rrule: null, start: '2026-03-25T20:00', end: '2026-03-25T23:00' }))
      await owner.post(status(items, daily.id, '2026-03-23T19:00'), { status: 'done' })

      const res = await owner.get(`${base}/chores`, { tz: TZ })
      expect(res.status).toBe(200)
      const titles = (list: View[]) => list.map((i) => `${i.title} ${i.originalStart.slice(5)}`)
      expect(res.body.date).toBe('2026-03-25')
      expect(titles(res.body.overdue)).toEqual(['Dishes 03-24T19:00'])
      expect(titles(res.body.today)).toEqual(['Dishes 03-25T19:00'])
      expect(titles(res.body.upcoming)).toEqual([
         'Dishes 03-26T19:00',
         'Bins 03-27T19:00',
         'Dishes 03-27T19:00',
         'Dishes 03-28T19:00',
         'Dishes 03-29T19:00',
         'Dishes 03-30T19:00',
         'Dishes 03-31T19:00',
         'Dishes 04-01T19:00',
      ])
   })

   it('needs a valid time zone', async () => {
      const { owner, base } = await home()
      expect((await owner.get(`${base}/chores`, { tz: 'Mars/Olympus' })).status).toBe(400)
   })
})
