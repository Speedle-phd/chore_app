import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Membership } from '../models/membershipModel'
import { Reminder } from '../models/reminderModel'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

// "Now" is Wednesday 25 March 2026, 12:00 in Berlin. Only Date is faked.
const NOW = new Date('2026-03-25T11:00:00Z')
const TZ = 'Europe/Berlin'

let app: ReturnType<typeof createApp>
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
})
afterAll(() => vi.useRealTimers())

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', cookie),
   post: (url: string, body: object) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

async function home() {
   const ownerUser = await signedInUser(app, 'Owner')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const mid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))?.id as string
   const base = `/api/households/${hid}`
   const join = async (fname: string) => {
      const person = await signedInUser(app, fname)
      const m = await Membership.create({ householdId: hid, userId: person.user._id, role: 'member' })
      return { cookie: person.cookie, mid: m.id as string, as: as(person.cookie) }
   }
   const oma = (
      await owner.post(`${base}/calendar-items`, {
         kind: 'birthday',
         title: 'Oma',
         allDay: true,
         start: '1944-03-28',
         end: '1944-03-29',
         timezone: TZ,
         rrule: 'FREQ=YEARLY',
         birthYear: 1944,
      })
   ).body as { id: string }
   return { hid, mid, owner, base, reminders: `${base}/reminders`, join, oma }
}

describe('reminder subscriptions', () => {
   it('subscribes to an entry, one subscription per target (saving again updates it)', async () => {
      const { owner, reminders, oma } = await home()
      const first = await owner.put(reminders, { target: { type: 'item', itemId: oma.id }, leadDays: [7, 0] })
      expect(first.status).toBe(200)
      expect(first.body).toMatchObject({ label: 'Oma', leadDays: [0, 7], channels: ['email'], target: { type: 'item', itemId: oma.id } })
      const again = await owner.put(reminders, { target: { type: 'item', itemId: oma.id }, leadDays: [1] })
      expect(again.body.id).toBe(first.body.id)
      expect((await owner.get(reminders)).body.map((r: { leadDays: number[] }) => r.leadDays)).toEqual([[1]])
   })

   it('member birthdays and “all birthdays” have readable labels', async () => {
      const { owner, reminders, join } = await home()
      const ben = await join('Ben')
      await owner.put(reminders, { target: { type: 'member', memberId: ben.mid }, leadDays: [0] })
      await owner.put(reminders, { target: { type: 'allBirthdays' }, leadDays: [1] })
      expect((await owner.get(reminders)).body.map((r: { label: string }) => r.label)).toEqual(['Ben’s birthday', 'All birthdays'])
   })

   it.each([
      ['no lead time', { target: { type: 'allBirthdays' }, leadDays: [] }, 400],
      ['too far ahead', { target: { type: 'allBirthdays' }, leadDays: [45] }, 400],
      ['an unknown target type', { target: { type: 'everything' }, leadDays: [0] }, 400],
      ['someone from another household', { target: { type: 'member', memberId: '64b000000000000000000001' }, leadDays: [0] }, 400],
   ])('rejects %s', async (_name, body, code) => {
      const { owner, reminders } = await home()
      expect((await owner.put(reminders, body)).status).toBe(code)
   })

   it('is private: others see only their own; another household’s entry is a 404', async () => {
      const { owner, reminders, join, oma } = await home()
      const ben = await join('Ben')
      const mine = (await owner.put(reminders, { target: { type: 'item', itemId: oma.id }, leadDays: [0] })).body
      expect((await ben.as.get(reminders)).body).toEqual([])
      expect((await ben.as.del(`${reminders}/${mine.id}`)).status).toBe(404)
      const other = await home()
      expect((await owner.put(reminders, { target: { type: 'item', itemId: other.oma.id }, leadDays: [0] })).status).toBe(404)
      const stranger = await signedInUser(app, 'Stranger')
      expect((await as(stranger.cookie).get(reminders)).status).toBe(404)
   })

   it('plans what will be sent: send date, lead time, age; overlapping subscriptions send once', async () => {
      const { owner, reminders, oma } = await home()
      await owner.patch('/api/account', { birthday: '1990-04-01' })
      await owner.put(reminders, { target: { type: 'item', itemId: oma.id }, leadDays: [0, 7] })
      await owner.put(reminders, { target: { type: 'allBirthdays' }, leadDays: [0, 1] })
      const res = await owner.get(`${reminders}/upcoming`, { tz: TZ, days: '14' })
      expect(res.status).toBe(200)
      // Oma's 7-days-ahead reminder (21 March) has passed; her day is covered by both subscriptions once.
      expect(res.body.map((r: { sendOn: string; leadDays: number; title: string; age: number | null }) => [r.sendOn, r.leadDays, r.title, r.age])).toEqual([
         ['2026-03-27', 1, 'Oma', 82],
         ['2026-03-28', 0, 'Oma', 82],
         ['2026-03-31', 1, 'Owner turns 36', 36],
         ['2026-04-01', 0, 'Owner turns 36', 36],
      ])
   })

   it('goes away with the entry, and with the people involved', async () => {
      const { owner, reminders, base, join, oma } = await home()
      const ben = await join('Ben')
      await owner.put(reminders, { target: { type: 'item', itemId: oma.id }, leadDays: [0] })
      await owner.put(reminders, { target: { type: 'member', memberId: ben.mid }, leadDays: [0] })
      await ben.as.put(reminders, { target: { type: 'allBirthdays' }, leadDays: [0] })
      expect(await Reminder.countDocuments({})).toBeGreaterThanOrEqual(3)

      await owner.del(`${base}/calendar-items/${oma.id}`)
      expect(await Reminder.countDocuments({ 'target.itemId': oma.id })).toBe(0)
      await owner.del(`${base}/members/${ben.mid}`)
      expect(await Reminder.countDocuments({ $or: [{ membershipId: ben.mid }, { 'target.memberId': ben.mid }] })).toBe(0)
   })
})
