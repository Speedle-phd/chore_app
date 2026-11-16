import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { CalendarItem } from '../models/calendarItemModel'
import { IcalFeed } from '../models/icalFeedModel'
import { Membership } from '../models/membershipModel'
import { Occurrence } from '../models/occurrenceModel'
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
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
   upload: (url: string, ics: string, fields: Record<string, string>, name = 'cal.ics') => {
      let req = request(app).post(url).set(H).set('Cookie', cookie).attach('file', Buffer.from(ics), name)
      for (const [k, v] of Object.entries(fields)) req = req.field(k, v)
      return req
   },
})

async function home() {
   const ownerUser = await signedInUser(app, 'Ada')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const mid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))?.id as string
   const base = `/api/households/${hid}`
   const join = async (fname: string) => {
      const person = await signedInUser(app, fname)
      const m = await Membership.create({ householdId: hid, userId: person.user._id, role: 'member' })
      return { mid: m.id as string, as: as(person.cookie) }
   }
   return { hid, mid, owner, base, join }
}

/** Path of a feed URL (`http://…/api/ical/<token>.ics` → `/api/ical/<token>.ics`). */
const pathOf = (url: string) => new URL(url).pathname
const fetchFeed = (url: string) => request(app).get(pathOf(url))

describe('subscribe feed', () => {
   it('creates a private link that serves the household calendar without a session', async () => {
      const { owner, base, join, hid } = await home()
      const ben = await join('Ben')
      await owner.post(`${base}/calendar-items`, {
         kind: 'chore',
         title: 'Bins out',
         allDay: false,
         start: '2026-03-26T19:00',
         end: '2026-03-26T19:15',
         timezone: TZ,
         memberIds: [ben.mid],
      })

      expect((await owner.get(`${base}/ical/feed`)).body).toEqual({ enabled: false, scope: 'all', issuedAt: null, lastUsedAt: null })
      const created = await owner.post(`${base}/ical/feed`, { scope: 'all' })
      expect(created.status).toBe(201)
      expect(created.body).toMatchObject({ enabled: true, scope: 'all', issuedAt: NOW.toISOString() })
      expect(created.body.url).toMatch(/^http:\/\/localhost:5173\/api\/ical\/[A-Za-z0-9_-]{43}\.ics$/)

      // Only the hash is stored.
      const token = pathOf(created.body.url).split('/').at(-1)?.replace('.ics', '') ?? ''
      const stored = await IcalFeed.findOne({ householdId: hid }).lean()
      expect(stored).not.toBeNull()
      expect(stored?.tokenHash).not.toContain(token)

      const res = await fetchFeed(created.body.url)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8')
      expect(res.text).toContain('X-WR-CALNAME:Home')
      // 19:00 in Berlin on 26 March 2026 (CET, before the DST change on the 29th) is 18:00 UTC.
      expect(res.text).toContain('DTSTART:20260326T180000Z')
      expect(res.text).toContain('SUMMARY:Bins out')
      expect(res.text).toContain('For: Ben')
      expect((await owner.get(`${base}/ical/feed`)).body.lastUsedAt).toBe(NOW.toISOString())
   })

   it('“only mine” leaves out entries for other people', async () => {
      const { owner, base, mid, join } = await home()
      const ben = await join('Ben')
      const entry = (title: string, memberIds: string[]) =>
         owner.post(`${base}/calendar-items`, {
            kind: 'event',
            title,
            allDay: true,
            start: '2026-03-27',
            end: '2026-03-28',
            timezone: TZ,
            memberIds,
         })
      await entry('Mine', [mid])
      await entry('Bens', [ben.mid])
      const { url } = (await owner.post(`${base}/ical/feed`, { scope: 'mine' })).body
      const text = (await fetchFeed(url)).text
      expect(text).toContain('SUMMARY:Mine')
      expect(text).not.toContain('SUMMARY:Bens')

      // Switching the scope keeps the link.
      expect((await owner.patch(`${base}/ical/feed`, { scope: 'all' })).body.scope).toBe('all')
      expect((await fetchFeed(url)).text).toContain('SUMMARY:Bens')
   })

   it('replacing or turning off the link stops the old one; leaving ends it', async () => {
      const { owner, base, join } = await home()
      const first = (await owner.post(`${base}/ical/feed`)).body.url
      const second = (await owner.post(`${base}/ical/feed`)).body.url
      expect((await fetchFeed(first)).status).toBe(404)
      expect((await fetchFeed(second)).status).toBe(200)
      expect((await owner.del(`${base}/ical/feed`)).status).toBe(204)
      expect((await fetchFeed(second)).status).toBe(404)
      expect((await owner.patch(`${base}/ical/feed`, { scope: 'mine' })).status).toBe(404)

      const ben = await join('Ben')
      const bens = (await ben.as.post(`${base}/ical/feed`)).body.url
      expect((await fetchFeed(bens)).status).toBe(200)
      expect((await ben.as.post(`${base}/leave`)).status).toBe(204)
      expect((await fetchFeed(bens)).status).toBe(404)
      expect(await IcalFeed.countDocuments({ membershipId: ben.mid })).toBe(0)
   })

   it('unknown or malformed tokens are 404; other households’ settings are 404', async () => {
      expect((await request(app).get(`/api/ical/${'a'.repeat(43)}.ics`)).status).toBe(404)
      expect((await request(app).get('/api/ical/nope.ics')).status).toBe(404)
      const { base } = await home()
      const stranger = as((await signedInUser(app, 'Eve')).cookie)
      expect((await stranger.get(`${base}/ical/feed`)).status).toBe(404)
      expect((await stranger.post(`${base}/ical/feed`)).status).toBe(404)
   })
})

const calendar = (...events: string[]) =>
   ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events, 'END:VCALENDAR'].join('\r\n')
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', 'DTSTAMP:20260101T000000Z', ...lines, 'END:VEVENT'].join('\r\n')

const FILE = calendar(
   vevent(
      'UID:yoga@x',
      'DTSTART;TZID=Europe/Berlin:20260330T180000',
      'DTEND;TZID=Europe/Berlin:20260330T190000',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'EXDATE;TZID=Europe/Berlin:20260406T180000',
      'SUMMARY:Yoga',
   ),
   vevent(
      'UID:yoga@x',
      'RECURRENCE-ID;TZID=Europe/Berlin:20260413T180000',
      'DTSTART;TZID=Europe/Berlin:20260414T180000',
      'DTEND;TZID=Europe/Berlin:20260414T190000',
      'SUMMARY:Yoga',
   ),
   vevent('UID:trip@x', 'DTSTART;VALUE=DATE:20260401', 'DTEND;VALUE=DATE:20260404', 'SUMMARY:Trip'),
   vevent('UID:pulse@x', 'DTSTART:20260401T080000Z', 'RRULE:FREQ=HOURLY', 'SUMMARY:Pulse'),
)

describe('.ics import', () => {
   it('previews without storing anything; problems come with a reason', async () => {
      const { owner, base, hid } = await home()
      const res = await owner.upload(`${base}/ical/import/preview`, FILE, { kind: 'event', tz: TZ })
      expect(res.status).toBe(200)
      expect(res.body.entries).toEqual([
         {
            uid: 'yoga@x',
            title: 'Yoga',
            allDay: false,
            start: '2026-03-30T18:00',
            end: '2026-03-30T19:00',
            timezone: TZ,
            repeats: true,
            duplicate: false,
            problem: null,
         },
         expect.objectContaining({ uid: 'trip@x', allDay: true, start: '2026-04-01', end: '2026-04-04', problem: null }),
         expect.objectContaining({ uid: 'pulse@x', problem: 'Repeat daily, weekly, monthly or yearly.' }),
      ])
      expect(await CalendarItem.countDocuments({ householdId: hid })).toBe(0)

      const asBirthdays = await owner.upload(`${base}/ical/import/preview`, FILE, { kind: 'birthday', tz: TZ })
      expect(asBirthdays.body.entries[0].problem).toBe('Birthdays must be all-day entries.')
   })

   it('imports the chosen entries with skipped and moved dates; repeating it skips them', async () => {
      const { owner, base, hid } = await home()
      const res = await owner.upload(`${base}/ical/import`, FILE, {
         kind: 'event',
         tz: TZ,
         uids: JSON.stringify(['yoga@x', 'pulse@x']),
      })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ imported: 1, skipped: 1 })

      const yoga = await CalendarItem.findOne({ householdId: hid, 'source.uid': 'yoga@x' }).lean()
      expect(yoga).toMatchObject({
         kind: 'event',
         title: 'Yoga',
         start: '2026-03-30T18:00',
         timezone: TZ,
         recurrence: { rrule: 'FREQ=WEEKLY;COUNT=4', exdates: ['2026-04-06T18:00'] },
         source: { uid: 'yoga@x', importedAt: NOW },
      })
      expect(await CalendarItem.countDocuments({ householdId: hid, 'source.uid': 'trip@x' })).toBe(0)
      expect(await Occurrence.find({ itemId: String(yoga?._id) }).select('originalStart start end -_id').lean()).toEqual([
         { originalStart: '2026-04-13T18:00', start: '2026-04-14T18:00', end: null },
      ])

      // The calendar shows 30 Mar, 14 Apr (moved) and 20 Apr; 6 Apr is skipped. Berlin is UTC+2 from 29 March.
      const listed = await owner.get(`${base}/calendar`, { from: '2026-03-29T00:00:00Z', to: '2026-04-30T00:00:00Z', tz: TZ })
      expect(listed.body.filter((i: { title: string }) => i.title === 'Yoga').map((i: { start: string }) => i.start)).toEqual([
         '2026-03-30T18:00:00+02:00',
         '2026-04-14T18:00:00+02:00',
         '2026-04-20T18:00:00+02:00',
      ])

      const again = await owner.upload(`${base}/ical/import/preview`, FILE, { kind: 'event', tz: TZ })
      expect(again.body.entries.map((e: { duplicate: boolean }) => e.duplicate)).toEqual([true, false, false])
      const repeat = await owner.upload(`${base}/ical/import`, FILE, { kind: 'event', tz: TZ, uids: '["yoga@x"]' })
      expect(repeat.body).toEqual({ imported: 0, skipped: 1 })
      expect(await CalendarItem.countDocuments({ householdId: hid, 'source.uid': 'yoga@x' })).toBe(1)
   })

   it('refuses files that aren’t calendars and bad fields; non-members get 404', async () => {
      const { owner, base } = await home()
      const notIcs = await owner.upload(`${base}/ical/import/preview`, 'hello', { kind: 'event', tz: TZ }, 'notes.txt')
      expect(notIcs.status).toBe(400)
      expect(notIcs.body.message).toBe('Choose a calendar file (.ics).')
      const garbage = await owner.upload(`${base}/ical/import/preview`, 'hello', { kind: 'event', tz: TZ })
      expect(garbage.body.message).toBe('This isn’t a calendar (.ics) file.')
      expect((await owner.upload(`${base}/ical/import/preview`, FILE, { kind: 'party', tz: TZ })).status).toBe(400)
      expect((await owner.upload(`${base}/ical/import`, FILE, { kind: 'event', tz: TZ, uids: '[]' })).status).toBe(400)
      expect((await owner.post(`${base}/ical/import/preview`, { kind: 'event', tz: TZ })).status).toBe(400)

      const stranger = as((await signedInUser(app, 'Eve')).cookie)
      expect((await stranger.upload(`${base}/ical/import/preview`, FILE, { kind: 'event', tz: TZ })).status).toBe(404)
   })

   it('deleting the household removes its links', async () => {
      const { owner, base, hid } = await home()
      const { url } = (await owner.post(`${base}/ical/feed`)).body
      expect((await owner.del(base)).status).toBe(204)
      expect((await fetchFeed(url)).status).toBe(404)
      expect(await IcalFeed.countDocuments({ householdId: hid })).toBe(0)
   })
})
