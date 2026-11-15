import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import type { SendMail } from '../mail/mailer'
import { Membership } from '../models/membershipModel'
import { ReminderDigest } from '../models/reminderDigestModel'
import { User } from '../models/userModel'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'
import { runReminderDigests } from './digestJob'

useTestDatabase()

let app: ReturnType<typeof createApp>
beforeAll(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-24T12:00:00Z') })
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
   post: (url: string, body: object) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
})

type Sent = { template: string; to: string; data: Record<string, unknown> }
let sent: Sent[] = []
let failFor: string | null = null
const fakeMail: SendMail = async (template, to, data) => {
   if (to === failFor) throw new Error('mailer down')
   sent.push({ template, to, data })
}
const runAt = (iso: string) => {
   vi.setSystemTime(new Date(iso))
   return runReminderDigests({ now: new Date(iso), sendMail: fakeMail, appUrl: 'http://localhost:5173' })
}

let ada: { email: string; userId: string }
let ben: { email: string; userId: string }
let cara: { email: string }

beforeAll(async () => {
   // Ada (Berlin) owns the household; Ben (New York) and Cara (unconfirmed address) are members.
   const a = await signedInUser(app, 'Ada')
   const hid: string = (await as(a.cookie).post('/api/households', { name: 'Home' })).body.id
   const base = `/api/households/${hid}`
   await as(a.cookie).patch('/api/account', { timezone: 'Europe/Berlin' })
   const b = await signedInUser(app, 'Ben')
   await Membership.create({ householdId: hid, userId: b.user._id, role: 'member' })
   await as(b.cookie).patch('/api/account', { timezone: 'America/New_York' })
   const c = await signedInUser(app, 'Cara')
   await Membership.create({ householdId: hid, userId: c.user._id, role: 'member' })
   await User.updateOne({ _id: c.user._id }, { $set: { emailVerifiedAt: null } })

   const entry = (data: object) => as(a.cookie).post(`${base}/calendar-items`, { allDay: true, timezone: 'Europe/Berlin', ...data }).then((r) => r.body)
   const oma = await entry({ kind: 'birthday', title: 'Oma', start: '1944-03-25', end: '1944-03-26', rrule: 'FREQ=YEARLY', birthYear: 1944 })
   const dentist = await entry({ kind: 'event', title: 'Dentist', allDay: false, start: '2026-03-26T09:30', end: '2026-03-26T10:30' })
   const party = await entry({ kind: 'event', title: 'Party', start: '2026-03-27', end: '2026-03-28' })

   await as(a.cookie).put(`${base}/reminders`, { target: { type: 'item', itemId: oma.id }, leadDays: [0] })
   await as(a.cookie).put(`${base}/reminders`, { target: { type: 'item', itemId: dentist.id }, leadDays: [1] })
   await as(a.cookie).put(`${base}/reminders`, { target: { type: 'item', itemId: party.id }, leadDays: [0] })
   await as(b.cookie).put(`${base}/reminders`, { target: { type: 'allBirthdays' }, leadDays: [0] })
   await as(c.cookie).put(`${base}/reminders`, { target: { type: 'allBirthdays' }, leadDays: [0] })

   ada = { email: a.user.email, userId: a.user.id as string }
   ben = { email: b.user.email, userId: b.user.id as string }
   cara = { email: c.user.email }
})
beforeEach(() => {
   sent = []
   failFor = null
})

describe('daily reminder digest', () => {
   it('sends nothing before 08:00 local time', async () => {
      const run = await runAt('2026-03-25T06:30:00Z') // 07:30 Berlin, 02:30 New York
      expect(sent).toEqual([])
      expect(run.sent).toBe(0)
   })

   it('sends Ada one digest at 08:00 Berlin, with today and coming up', async () => {
      await runAt('2026-03-25T07:05:00Z')
      expect(sent.map((s) => s.to)).toEqual([ada.email])
      expect(sent[0]).toMatchObject({
         template: 'reminder_digest',
         data: {
            name: 'Ada',
            date: 'Wednesday 25 March',
            count: 2,
            link: 'http://localhost:5173/settings',
            groups: [
               {
                  household: 'Home',
                  today: [{ title: 'Oma (82)', when: 'all day' }],
                  soon: [{ title: 'Dentist', when: 'tomorrow, Thu 26 Mar at 09:30' }],
               },
            ],
         },
      })
   })

   it('never sends the same day twice, even when runs overlap', async () => {
      await Promise.all([runAt('2026-03-25T09:00:00Z'), runAt('2026-03-25T09:00:00Z')])
      expect(sent).toEqual([])
   })

   it('Ben gets his at 08:00 New York; Cara (unconfirmed address) never', async () => {
      await runAt('2026-03-25T11:00:00Z') // 07:00 in New York
      expect(sent).toEqual([])
      await runAt('2026-03-25T12:05:00Z') // 08:05 in New York
      expect(sent.map((s) => s.to)).toEqual([ben.email])
      expect(sent.some((s) => s.to === cara.email)).toBe(false)
   })

   it('a day with nothing due sends nothing', async () => {
      // The dentist reminder went out yesterday; nothing is due on the 26th.
      await runAt('2026-03-26T07:05:00Z')
      expect(sent.filter((s) => s.to === ada.email)).toEqual([])
      expect(await ReminderDigest.findOne({ userId: ada.userId, date: '2026-03-26' }).lean()).toMatchObject({ status: 'sent', count: 0 })
   })

   it('retries a failed send, at most three times a day', async () => {
      // The party on the 27th is due; the mailer is down all morning.
      failFor = ada.email
      for (const t of ['07:05', '07:20', '07:35', '07:50']) await runAt(`2026-03-27T${t}:00Z`)
      const day = await ReminderDigest.findOne({ userId: ada.userId, date: '2026-03-27' }).lean()
      expect(day).toMatchObject({ status: 'failed', attempts: 3, error: 'mailer down' })
      failFor = null
      await runAt('2026-03-27T08:05:00Z')
      expect(sent.filter((s) => s.to === ada.email)).toEqual([]) // gave up for the day
   })

   it('drops missed days: Friday’s party isn’t sent on Saturday', async () => {
      // The 27th never went out; on the 28th only the 28th counts.
      await runAt('2026-03-28T07:05:00Z')
      expect(sent).toEqual([])
      const day = await ReminderDigest.findOne({ userId: ada.userId, date: '2026-03-28' }).lean()
      expect(day).toMatchObject({ status: 'sent', count: 0 })
   })

   it('uses Berlin until someone’s zone is known', async () => {
      await User.updateOne({ _id: ben.userId }, { $set: { timezone: null } })
      await runAt('2027-03-25T07:05:00Z') // Oma's birthday next year, 08:05 Berlin
      expect(sent.map((s) => s.to).sort()).toEqual([ada.email, ben.email].sort())
   })

   it('rejects an unknown time zone from the browser', async () => {
      const someone = await signedInUser(app, 'Dora')
      const res = await as(someone.cookie).patch('/api/account', { timezone: 'Mars/Olympus' })
      expect(res.status).toBe(400)
      const ok = await as(someone.cookie).patch('/api/account', { timezone: 'Asia/Tokyo' })
      expect(ok.body.timezone).toBe('Asia/Tokyo')
   })
})
