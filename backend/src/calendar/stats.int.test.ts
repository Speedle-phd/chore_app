import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Membership } from '../models/membershipModel'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

const TZ = 'Europe/Berlin'
const NOW = new Date('2026-03-25T11:00:00Z')

let app: ReturnType<typeof createApp>
beforeAll(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-19T09:00:00Z') })
   app = createApp(
      loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'set-by-useTestDatabase', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: 'unused' }),
      {
         sendMail: async () => undefined,
         isBreached: async () => false,
         rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
      },
   )
})
afterAll(() => vi.useRealTimers())

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', cookie),
   post: (url: string, body: object) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
})
const status = (items: string, id: string, key: string) => `${items}/${id}/occurrences/${encodeURIComponent(key)}/status`
const at = (iso: string) => vi.setSystemTime(new Date(iso))

type MemberRow = {
   memberId: string
   points: number
   done: number
   onTime: number
   skipped: number
   missed: number
   share: number | null
   streak: { current: number; best: number } | null
   badges: { id: string }[] | null
}

describe('statistics', () => {
   let base: string
   let ada: { mid: string; as: ReturnType<typeof as> }
   let ben: { mid: string; as: ReturnType<typeof as> }

   beforeAll(async () => {
      // The household is founded on 19 March; chores from the 20th.
      at('2026-03-19T09:00:00Z')
      const owner = await signedInUser(app, 'Ada')
      const hid: string = (await as(owner.cookie).post('/api/households', { name: 'Home' })).body.id
      base = `/api/households/${hid}`
      ada = { mid: (await Membership.findOne({ householdId: hid, userId: owner.user._id }))?.id as string, as: as(owner.cookie) }
      const benUser = await signedInUser(app, 'Ben')
      ben = { mid: (await Membership.create({ householdId: hid, userId: benUser.user._id, role: 'member' })).id as string, as: as(benUser.cookie) }
      const items = `${base}/calendar-items`
      const chore = (over: object) =>
         ada.as.post(items, { kind: 'chore', allDay: false, timezone: TZ, ...over }).then((r) => r.body as { id: string })
      const dishes = await chore({ title: 'Dishes', start: '2026-03-20T19:00', end: '2026-03-20T19:30', rrule: 'FREQ=DAILY', memberIds: [ada.mid], chore: { effort: 2 } })
      const tidy = await chore({ title: 'Tidy', start: '2026-03-21T10:00', end: '2026-03-21T11:00', memberIds: [ada.mid, ben.mid], chore: { effort: 1, assignmentMode: 'everyone' } })

      at('2026-03-20T18:10:00Z') // on time (due 18:30Z)
      await ada.as.post(status(items, dishes.id, '2026-03-20T19:00'), { status: 'done' })
      at('2026-03-21T09:30:00Z')
      await ada.as.post(status(items, tidy.id, '2026-03-21T10:00'), { status: 'done' })
      at('2026-03-21T21:00:00Z') // late (due 18:30Z), still the 21st in Berlin
      await ada.as.post(status(items, dishes.id, '2026-03-21T19:00'), { status: 'done' })
      at('2026-03-22T18:00:00Z') // Ben stands in for Ada
      await ben.as.post(status(items, dishes.id, '2026-03-22T19:00'), { status: 'done' })
      at('2026-03-23T08:00:00Z')
      await ada.as.post(status(items, dishes.id, '2026-03-23T19:00'), { status: 'skipped' })
      at(NOW.toISOString()) // 24 March: nobody did the dishes → missed
   })

   const week = { from: '2026-03-20', to: '2026-03-26', tz: TZ }

   it('counts points, on time, missed, fair share and the chore table', async () => {
      const res = await ada.as.get(`${base}/stats`, week)
      expect(res.status).toBe(200)
      // On time: Ada on the 20th, Ada's Tidy, Ben on the 22nd; Ada was late on the 21st.
      expect(res.body.totals).toEqual({ done: 4, onTime: 3, points: 7, skipped: 1, missed: 2, onTimeRate: 0.75 })
      const byId = new Map<string, MemberRow>(res.body.members.map((m: MemberRow) => [m.memberId, m]))
      expect(byId.get(ada.mid)).toMatchObject({ points: 5, done: 3, onTime: 2, skipped: 1, missed: 1 })
      expect(byId.get(ben.mid)).toMatchObject({ points: 2, done: 1, onTime: 1, missed: 1 })
      expect(byId.get(ada.mid)?.share).toBeCloseTo(5 / 7)
      expect(res.body.fairShare).toBe(0.5)
      expect(res.body.chores.map((c: { title: string; done: number; topMemberId: string }) => [c.title, c.done, c.topMemberId])).toEqual([
         ['Dishes', 3, ada.mid],
         ['Tidy', 1, ada.mid],
      ])
      expect(res.body.bucket).toBe('day')
      expect(res.body.series.map((p: { points: number }) => p.points)).toEqual([2, 3, 2, 0, 0, 0])
   })

   it('streaks and badges (all-time)', async () => {
      const res = await ada.as.get(`${base}/stats`, week)
      const byId = new Map<string, MemberRow>(res.body.members.map((m: MemberRow) => [m.memberId, m]))
      // Ada did chores on the 20th and 21st; nothing since the 22nd → current streak 0.
      expect(byId.get(ada.mid)?.streak).toEqual({ current: 0, best: 2 })
      expect(byId.get(ada.mid)?.badges?.map((b) => b.id)).toEqual(['first'])
      expect(byId.get(ben.mid)?.badges?.map((b) => b.id)).toEqual(['first'])
      expect(res.body.badgeCatalog.length).toBeGreaterThan(5)
   })

   it('owners/admins switch the playful parts off; members can’t', async () => {
      expect((await ben.as.patch(`${base}/motivation`, { badges: false })).status).toBe(403)
      expect((await ada.as.patch(`${base}/motivation`, {})).status).toBe(400)
      const res = await ada.as.patch(`${base}/motivation`, { badges: false, streaks: false })
      expect(res.status).toBe(200)
      expect(res.body.motivation).toEqual({ leaderboard: true, badges: false, streaks: false })
      const stats = (await ben.as.get(`${base}/stats`, week)).body
      expect(stats.motivation).toEqual({ leaderboard: true, badges: false, streaks: false })
      expect(stats.members.every((m: MemberRow) => m.badges === null && m.streak === null)).toBe(true)
      expect(stats.badgeCatalog).toEqual([])
      await ada.as.patch(`${base}/motivation`, { badges: true, streaks: true })
   })

   it.each([
      ['from after to', { from: '2026-03-26', to: '2026-03-20', tz: TZ }],
      ['more than a year', { from: '2025-01-01', to: '2026-03-20', tz: TZ }],
      ['not a date', { from: 'yesterday', to: '2026-03-20', tz: TZ }],
   ])('rejects %s', async (_name, query) => {
      expect((await ada.as.get(`${base}/stats`, query)).status).toBe(400)
   })

   it('is a 404 for strangers', async () => {
      const stranger = await signedInUser(app, 'Stranger')
      expect((await as(stranger.cookie).get(`${base}/stats`, week)).status).toBe(404)
   })
})
