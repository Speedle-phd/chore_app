import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { CalendarItem } from '../models/calendarItemModel'
import { Membership, type Role } from '../models/membershipModel'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

// "Now" is Wednesday 25 March 2026, 12:00 in Berlin (CET). Only Date is faked.
const NOW = new Date('2026-03-25T11:00:00Z')
// A week later: Wednesday 1 April 2026, 12:00 in Berlin (CEST since 29 March).
const LATER = new Date('2026-04-01T10:00:00Z')
const TZ = 'Europe/Berlin'
const WINDOW = { from: '2026-03-23T00:00:00+01:00', to: '2026-04-20T00:00:00+02:00', tz: TZ }

let app: ReturnType<typeof createApp>
let notices: ReturnType<typeof vi.spyOn>
beforeAll(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: NOW })
   app = createApp(
      loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'set-by-useTestDatabase', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: 'unused' }),
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
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

type View = { originalStart: string; archived: boolean; chore: { state: string; overdue: boolean } | null }

async function home() {
   const ownerUser = await signedInUser(app, 'Owner')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const mid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))?.id as string
   const base = `/api/households/${hid}`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      const m = await Membership.create({ householdId: hid, userId: person.user._id, role })
      return { mid: m.id as string, as: as(person.cookie) }
   }
   const list = async (): Promise<View[]> => (await owner.get(`${base}/calendar`, WINDOW)).body
   const agenda = async () => (await owner.get(`${base}/chores`, { tz: TZ })).body
   return { hid, mid, owner, base, items: `${base}/calendar-items`, join, list, agenda }
}

const daily = (over: object = {}) => ({
   kind: 'chore',
   title: 'Dishes',
   allDay: false,
   start: '2026-03-23T19:00',
   end: '2026-03-23T19:30',
   timezone: TZ,
   rrule: 'FREQ=DAILY',
   ...over,
})
const occ = (items: string, id: string, key: string) => `${items}/${id}/occurrences/${encodeURIComponent(key)}`

describe('archiving chores', () => {
   it('keeps only the history: calendar, agenda and stats', async () => {
      const { owner, items, mid, hid, list, agenda, base } = await home()
      const entry = (await owner.post(items, daily({ memberIds: [mid] }))).body
      await owner.post(`${occ(items, entry.id, '2026-03-23T19:00')}/status`, { status: 'done' })
      expect((await agenda()).overdue).toHaveLength(1) // the 24th

      notices.mockClear()
      const res = await owner.post(`${items}/${entry.id}/archive`)
      expect(res.status).toBe(200)
      expect(res.body.archivedAt).toBe(NOW.toISOString())
      expect(notices.mock.calls[0]?.map(String)).toEqual([hid, 'calendar'])

      expect((await list()).map((i) => [i.originalStart, i.archived, i.chore?.state])).toEqual([['2026-03-23T19:00', true, 'done']])
      const after = await agenda()
      expect([after.overdue, after.today, after.upcoming]).toEqual([[], [], []])
      const stats = (await owner.get(`${base}/stats`, { from: '2026-03-23', to: '2026-03-30', tz: TZ })).body
      expect(stats.totals).toMatchObject({ done: 1, missed: 0 })

      // Archiving again changes nothing.
      expect((await owner.post(`${items}/${entry.id}/archive`)).body.archivedAt).toBe(NOW.toISOString())
   })

   it('refuses marking, moving and skipping until restored; editing still works', async () => {
      const { owner, items, mid } = await home()
      const entry = (await owner.post(items, daily({ memberIds: [mid] }))).body
      await owner.post(`${items}/${entry.id}/archive`)
      const key = '2026-03-25T19:00'
      const marked = await owner.post(`${occ(items, entry.id, key)}/status`, { status: 'done' })
      expect(marked.status).toBe(409)
      expect(marked.body.message).toBe('This chore is archived. Restore it first.')
      expect((await owner.patch(occ(items, entry.id, key), { start: '2026-03-25T20:00:00+01:00' })).status).toBe(409)
      expect((await owner.del(occ(items, entry.id, key))).status).toBe(409)

      const edited = await owner.put(`${items}/${entry.id}`, daily({ title: 'Dishes (old)', memberIds: [mid] }))
      expect(edited.status).toBe(200)
      expect(edited.body).toMatchObject({ title: 'Dishes (old)', archivedAt: NOW.toISOString() })
   })

   it('restoring starts again from today: the archived days are skipped, not missed', async () => {
      const { owner, items, mid, list, agenda } = await home()
      const entry = (await owner.post(items, daily({ memberIds: [mid] }))).body
      await owner.post(`${items}/${entry.id}/archive`)

      vi.setSystemTime(LATER)
      const res = await owner.post(`${items}/${entry.id}/restore`)
      expect(res.status).toBe(200)
      expect(res.body.archivedAt).toBeNull()
      // 25–31 March fell in the archived time (the 25th's 19:00 was after archiving at 12:00).
      expect(res.body.exdates).toEqual([
         '2026-03-25T19:00',
         '2026-03-26T19:00',
         '2026-03-27T19:00',
         '2026-03-28T19:00',
         '2026-03-29T19:00',
         '2026-03-30T19:00',
         '2026-03-31T19:00',
      ])
      const now = await agenda()
      // The 23rd and 24th were missed before archiving and stay missed; today's is open.
      expect(now.overdue.map((i: View) => i.originalStart)).toEqual(['2026-03-23T19:00', '2026-03-24T19:00'])
      expect(now.today.map((i: View) => i.originalStart)).toEqual(['2026-04-01T19:00'])
      expect((await list()).every((i) => !i.archived)).toBe(true)
   })

   it('restoring an after-completion chore moves its open one to today', async () => {
      const { owner, items, mid } = await home()
      const entry = (
         await owner.post(items, daily({ rrule: null, afterDays: 3, start: '2026-03-20T09:00', end: '2026-03-20T09:30', memberIds: [mid] }))
      ).body
      await owner.post(`${items}/${entry.id}/archive`)
      vi.setSystemTime(LATER)
      const restored = (await owner.post(`${items}/${entry.id}/restore`)).body
      expect([restored.start, restored.end]).toEqual(['2026-04-01T09:00', '2026-04-01T09:30'])
   })

   it('rights: creator or admin; others 403; non-members 404; only chores', async () => {
      const { owner, items, join } = await home()
      const ownersChore = (await owner.post(items, daily())).body
      const member = await join('member')
      const admin = await join('admin')
      expect((await member.as.post(`${items}/${ownersChore.id}/archive`)).status).toBe(403)
      expect((await admin.as.post(`${items}/${ownersChore.id}/archive`)).status).toBe(200)
      expect((await member.as.post(`${items}/${ownersChore.id}/restore`)).status).toBe(403)

      const membersChore = (await member.as.post(items, daily({ title: 'Mine' }))).body
      expect((await member.as.post(`${items}/${membersChore.id}/archive`)).status).toBe(200)

      const stranger = as((await signedInUser(app, 'Eve')).cookie)
      expect((await stranger.post(`${items}/${ownersChore.id}/restore`)).status).toBe(404)

      const event = (await owner.post(items, daily({ kind: 'event', rrule: null }))).body
      expect((await owner.post(`${items}/${event.id}/archive`)).status).toBe(400)
      expect(await CalendarItem.countDocuments({ _id: event.id, archivedAt: { $ne: null } })).toBe(0)
   })
})
