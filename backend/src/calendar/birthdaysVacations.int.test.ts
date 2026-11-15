import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Membership } from '../models/membershipModel'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

// "Now" is Wednesday 25 March 2026, 12:00 in Berlin. Only Date is faked.
const NOW = new Date('2026-03-25T11:00:00Z')
const TZ = 'Europe/Berlin'

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
afterEach(() => notices.mockClear())

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', cookie),
   post: (url: string, body: object) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   multipart: (url: string, fields: Record<string, string>) => {
      const req = request(app).post(url).set(H).set('Cookie', cookie)
      for (const [k, v] of Object.entries(fields)) req.field(k, v)
      return req
   },
})

type View = {
   title: string
   start: string
   originalStart: string
   kind: string
   source: string
   memberIds: string[]
   itemId: string
   chore: { conflict: { away: string[]; suggestion: string[] | null } | null } | null
}

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
   const list = async (query: Record<string, string>): Promise<View[]> =>
      (await owner.get(`${base}/calendar`, { tz: TZ, ...query })).body
   notices.mockClear()
   return { hid, mid, owner, base, items: `${base}/calendar-items`, join, list }
}

describe('member birthdays', () => {
   it('accounts set their own; validated; shown in the calendar with the age', async () => {
      const { owner, mid, list, base, hid } = await home()
      expect((await owner.patch('/api/account', { birthday: '12.05.1990' })).status).toBe(400)
      expect((await owner.patch('/api/account', { birthday: '2030-01-01' })).status).toBe(400)
      const res = await owner.patch('/api/account', { birthday: '1990-05-12' })
      expect(res.status).toBe(200)
      expect(res.body.birthday).toBe('1990-05-12')
      expect(notices.mock.calls.some((c: unknown[]) => String(c[0]) === hid && c.includes('calendar'))).toBe(true)

      const may = await list({ from: '2026-05-01T00:00:00+02:00', to: '2026-06-01T00:00:00+02:00' })
      expect(may).toEqual([
         expect.objectContaining({
            title: 'Owner turns 36',
            kind: 'birthday',
            allDay: true,
            start: '2026-05-12',
            end: '2026-05-13',
            memberIds: [mid],
            source: 'member',
            itemId: '',
         }),
      ])
      const members = (await owner.get(`${base}/members`)).body
      expect(members[0].birthday).toBe('1990-05-12')

      expect((await owner.patch('/api/account', { birthday: null })).body.birthday).toBeNull()
      expect(await list({ from: '2026-05-01T00:00:00+02:00', to: '2026-06-01T00:00:00+02:00' })).toEqual([])
   })

   it('profiles can have a birthday without a year; kind and member filters apply', async () => {
      const { owner, base, list } = await home()
      const created = await owner.multipart(`${base}/profiles`, { fname: 'Mia', lname: 'Kid', birthday: '--12-24' })
      expect(created.status).toBe(201)
      expect(created.body.birthday).toBe('--12-24')
      const dec = { from: '2026-12-01T00:00:00+01:00', to: '2027-01-01T00:00:00+01:00' }
      expect((await list(dec)).map((i) => [i.title, i.start])).toEqual([['Mia’s birthday', '2026-12-24']])
      expect(await list({ ...dec, kinds: 'chore' })).toEqual([])
      expect((await list({ ...dec, memberIds: created.body.id })).length).toBe(1)

      const bad = await owner.multipart(`${base}/profiles`, { fname: 'Leo', lname: 'Kid', birthday: '1999-02-29' })
      expect(bad.status).toBe(400)
   })

   it('birthday entries can carry a birth year for the age (even on 29 February)', async () => {
      const { owner, items, list } = await home()
      const entry = {
         kind: 'birthday',
         title: 'Oma',
         allDay: true,
         start: '1944-02-29',
         end: '1944-03-01',
         timezone: TZ,
         // Last day of February: 28th in normal years, 29th in leap years.
         rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1',
         birthYear: 1944,
      }
      const res = await owner.post(items, entry)
      expect(res.status).toBe(201)
      expect(res.body.birthYear).toBe(1944)
      const feb = await list({ from: '2027-02-01T00:00:00+01:00', to: '2027-03-01T00:00:00+01:00' })
      expect(feb.map((i) => [i.title, i.start, (i as unknown as { age: number }).age])).toEqual([['Oma', '2027-02-28', 83]])
      expect((await owner.post(items, { ...entry, kind: 'event' })).status).toBe(400)
      expect((await owner.post(items, { ...entry, birthYear: 1950 })).status).toBe(400)
   })

   it('other households never see them', async () => {
      const mine = await home()
      await mine.owner.patch('/api/account', { birthday: '1990-05-12' })
      const other = await home()
      expect(await other.list({ from: '2026-05-01T00:00:00+02:00', to: '2026-06-01T00:00:00+02:00' })).toEqual([])
   })
})

describe('vacation conflicts', () => {
   const chore = (over: object) => ({
      kind: 'chore',
      title: 'Dishes',
      allDay: false,
      start: '2026-03-30T19:00',
      end: '2026-03-30T19:30',
      timezone: TZ,
      rrule: 'FREQ=DAILY',
      ...over,
   })
   const vacation = (memberIds: string[], start: string, end: string) => ({
      kind: 'vacation',
      title: 'Away',
      allDay: true,
      start,
      end,
      timezone: TZ,
      memberIds,
   })
   const WEEK = { from: '2026-03-30T00:00:00+02:00', to: '2026-04-06T00:00:00+02:00' }

   it('rotation: the away person’s dates get a substitute from the team, fewest assignments first', async () => {
      const { owner, items, mid, join, list } = await home()
      const ben = await join('Ben')
      const cara = await join('Cara')
      await owner.post(items, chore({ memberIds: [mid, ben.mid, cara.mid], chore: { rotation: true } }))
      // Ben has another chore that week, so Cara is less busy.
      await owner.post(items, chore({ title: 'Bins', rrule: 'FREQ=WEEKLY', memberIds: [ben.mid] }))
      await owner.post(items, vacation([mid], '2026-03-30', '2026-04-02'))

      const dishes = (await list(WEEK)).filter((i) => i.title === 'Dishes')
      const conflicts = dishes.map((i) => [i.originalStart.slice(5, 10), i.memberIds, i.chore?.conflict])
      // Turns: owner, Ben, Cara, owner… The owner is away 30 Mar–1 Apr, so only the 30th clashes;
      // Cara is suggested because Ben also has the bins that week.
      expect(conflicts.slice(0, 4)).toEqual([
         ['03-30', [mid], { away: [mid], suggestion: [cara.mid] }],
         ['03-31', [ben.mid], null],
         ['04-01', [cara.mid], null],
         ['04-02', [mid], null],
      ])
   })

   it('“any one of them”: no conflict while someone assigned is here', async () => {
      const { owner, items, mid, join, list } = await home()
      const ben = await join('Ben')
      await owner.post(items, chore({ memberIds: [mid, ben.mid] }))
      await owner.post(items, vacation([mid], '2026-03-30', '2026-04-06'))
      expect((await list(WEEK)).filter((i) => i.kind === 'chore').every((i) => i.chore?.conflict === null)).toBe(true)
   })

   it('“each of them”: the away person’s part is dropped', async () => {
      const { owner, items, mid, base, list } = await home()
      const kid = (await owner.multipart(`${base}/profiles`, { fname: 'Mia', lname: 'Kid' })).body.id as string
      await owner.post(items, chore({ rrule: null, memberIds: [mid, kid], chore: { assignmentMode: 'everyone' } }))
      await owner.post(items, vacation([kid], '2026-03-29', '2026-04-01'))
      const [dishes] = (await list(WEEK)).filter((i) => i.kind === 'chore')
      expect(dishes?.chore?.conflict).toEqual({ away: [kid], suggestion: [mid] })
   })

   it('accepting the suggestion (reassign this date) clears the conflict; the agenda shows conflicts too', async () => {
      const { owner, items, mid, join, list, base } = await home()
      const ben = await join('Ben')
      const entry = (
         await owner.post(items, chore({ rrule: null, start: '2026-03-26T19:00', end: '2026-03-26T19:30', memberIds: [mid], chore: {} }))
      ).body
      await owner.post(items, vacation([mid], '2026-03-26', '2026-03-28'))

      const agenda = (await owner.get(`${base}/chores`, { tz: TZ })).body
      expect(agenda.upcoming[0].chore.conflict).toEqual({ away: [mid], suggestion: [ben.mid] })

      const res = await owner.patch(`${items}/${entry.id}/occurrences/${encodeURIComponent('2026-03-26T19:00')}?scope=this`, {
         memberIds: [ben.mid],
      })
      expect(res.status).toBe(204)
      const [after] = (await list({ from: '2026-03-26T00:00:00+01:00', to: '2026-03-27T00:00:00+01:00' })).filter((i) => i.kind === 'chore')
      expect(after?.memberIds).toEqual([ben.mid])
      expect(after?.chore?.conflict).toBeNull()
   })

   it('done chores have no conflict', async () => {
      const { owner, items, mid, join, list } = await home()
      await join('Ben')
      const entry = (await owner.post(items, chore({ rrule: null, start: '2026-03-24T19:00', end: '2026-03-24T19:30', memberIds: [mid] }))).body
      await owner.post(items, vacation([mid], '2026-03-24', '2026-03-25'))
      await owner.post(`${items}/${entry.id}/occurrences/${encodeURIComponent('2026-03-24T19:00')}/status`, { status: 'done' })
      const [dishes] = (await list({ from: '2026-03-24T00:00:00+01:00', to: '2026-03-25T00:00:00+01:00' })).filter((i) => i.kind === 'chore')
      expect(dishes?.chore?.conflict).toBeNull()
   })
})
