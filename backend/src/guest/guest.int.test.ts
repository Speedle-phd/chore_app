import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { sha256 } from '../auth/crypto'
import { loadEnv } from '../config/env'
import { GuestInfo, GuestLink } from '../models/guestModels'
import { Membership } from '../models/membershipModel'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

const NOW = new Date('2026-11-18T10:00:00Z')
const env = loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'set-by-useTestDatabase', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: 'unused' })
const deps = { sendMail: async () => undefined, isBreached: async () => false, rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 } }

let app: ReturnType<typeof createApp>
beforeAll(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: NOW })
   app = createApp(env, deps)
})
afterAll(() => vi.useRealTimers())

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string) => request(app).get(url).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

async function home() {
   const ownerUser = await signedInUser(app, 'Ada')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Sunny Home' })).body.id
   const base = `/api/households/${hid}/guest`
   const join = async (fname: string, role: 'member' | 'admin' = 'member') => {
      const person = await signedInUser(app, fname)
      await Membership.create({ householdId: hid, userId: person.user._id, role })
      return as(person.cookie)
   }
   return { hid, owner, base, join }
}

const CONTENT = {
   wifi: { network: 'Sunny-5G', password: 'correct horse', security: 'WPA', hidden: false },
   emergency: { address: 'Hauptstraße 1, 10115 Berlin', numbers: [{ label: 'Fire brigade & ambulance', number: '112' }], pharmacy: '' },
   contacts: [{ name: 'Oma Gerda', relation: 'Grandma', phone: '+49 30 1234567', note: 'Lives next door' }],
   people: [],
   notes: [{ title: 'Fuse box', text: 'Cellar, left of the door' }],
}

const pathOf = (url: string) => new URL(url).pathname.replace(/^\/guest\//, '/api/guest/')
const open = (url: string) => request(app).get(pathOf(url))

describe('guest page content', () => {
   it('members read it (Germany’s numbers prefilled); only owners and admins change it; strangers get 404', async () => {
      const { owner, base, join } = await home()
      const ben = await join('Ben')
      const first = await ben.get(base)
      expect(first.status).toBe(200)
      expect(first.body).toMatchObject({ wifi: null, contacts: [], people: [], notes: [], updatedAt: null })
      expect(first.body.emergency.numbers).toEqual([
         { label: 'Fire brigade & ambulance', number: '112' },
         { label: 'Police', number: '110' },
      ])

      expect((await ben.put(base, CONTENT)).status).toBe(403)
      const saved = await owner.put(base, CONTENT)
      expect(saved.status).toBe(200)
      expect(saved.body).toMatchObject({ ...CONTENT, updatedAt: NOW.toISOString() })
      expect((await ben.get(base)).body.wifi).toEqual(CONTENT.wifi)
      const admin = await join('Cid', 'admin')
      expect((await admin.put(base, { ...CONTENT, notes: [] })).status).toBe(200)

      const stranger = as((await signedInUser(app, 'Eve')).cookie)
      expect((await stranger.get(base)).status).toBe(404)
   })

   it('checks the input: Wi-Fi password rules, phone numbers, required names, limits', async () => {
      const { owner, base } = await home()
      const bad = async (patch: object) => (await owner.put(base, { ...CONTENT, ...patch })).body
      expect((await bad({ wifi: { ...CONTENT.wifi, password: 'short' } })).details?.join(' ')).toContain('8 to 63 characters')
      expect((await bad({ wifi: { ...CONTENT.wifi, security: 'nopass' } })).details?.join(' ')).toContain('open network has no password')
      expect((await bad({ wifi: { ...CONTENT.wifi, network: 'ü'.repeat(17) } })).details?.join(' ')).toContain('32 bytes')
      expect((await bad({ contacts: [{ ...CONTENT.contacts[0], phone: 'call me' }] })).details?.join(' ')).toContain('only digits')
      expect((await bad({ notes: [{ title: '', text: 'x' }] })).details?.join(' ')).toContain('Title is missing')
      expect((await owner.put(base, { ...CONTENT, notes: Array.from({ length: 31 }, () => ({ title: 'n', text: '' })) })).status).toBe(400)
      // An open network is fine without a password; nothing was stored by the failed attempts.
      expect((await owner.put(base, { ...CONTENT, wifi: { network: 'Cafe', password: '', security: 'nopass', hidden: false } })).status).toBe(200)
      expect(await GuestInfo.countDocuments({})).toBeGreaterThan(0)
   })
})

describe('guest links', () => {
   it('managers make a link; its address is shown once and only the token’s hash is stored', async () => {
      const { owner, base, join, hid } = await home()
      const ben = await join('Ben')
      expect((await ben.post(`${base}/links`, { label: 'Lena', sections: ['wifi'] })).status).toBe(403)
      expect((await ben.get(`${base}/links`)).status).toBe(403)

      const made = await owner.post(`${base}/links`, { label: 'Lena, babysitter', sections: ['notes', 'wifi'] })
      expect(made.status).toBe(201)
      expect(made.body).toMatchObject({ label: 'Lena, babysitter', sections: ['wifi', 'notes'], expiresAt: null, expired: false, lastOpenedAt: null })
      const token = (made.body.url as string).split('/guest/')[1] ?? ''
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      const stored = await GuestLink.findById(made.body.id).lean()
      expect(stored?.tokenHash).toBe(sha256(token))
      expect(JSON.stringify(stored)).not.toContain(token)

      const list = await owner.get(`${base}/links`)
      expect(list.body).toHaveLength(1)
      expect(list.body[0].url).toBeUndefined()
      expect(String(stored?.householdId)).toBe(hid)
   })

   it('the page works without a session and shows only the chosen sections that have content', async () => {
      const { owner, base } = await home()
      await owner.put(base, CONTENT)
      const { body } = await owner.post(`${base}/links`, { label: 'Lena', sections: ['wifi', 'people', 'notes'] })

      const page = await open(body.url)
      expect(page.status).toBe(200)
      expect(page.headers['cache-control']).toBe('no-store')
      expect(page.headers['x-robots-tag']).toContain('noindex')
      expect(page.body).toEqual({
         household: 'Sunny Home',
         label: 'Lena',
         sections: { wifi: CONTENT.wifi, notes: CONTENT.notes }, // people chosen but empty; contacts not chosen
         updatedAt: NOW.toISOString(),
      })
      expect(JSON.stringify(page.body)).not.toContain('Oma Gerda')
      expect((await owner.get(`${base}/links`)).body[0].lastOpenedAt).toBe(NOW.toISOString())

      // Changing the sections changes the page at once.
      await owner.patch(`${base}/links/${body.id}`, { sections: ['contacts'] })
      expect((await open(body.url)).body.sections).toEqual({ contacts: CONTENT.contacts })
   })

   it('replace: the old address stops working; revoke: 404; unknown or malformed tokens: 404', async () => {
      const { owner, base } = await home()
      const { body } = await owner.post(`${base}/links`, { label: 'Lena', sections: ['emergency'] })
      const replaced = await owner.post(`${base}/links/${body.id}/replace`)
      expect(replaced.status).toBe(200)
      expect(replaced.body.url).not.toBe(body.url)
      expect((await open(body.url)).status).toBe(404)
      expect((await open(replaced.body.url)).status).toBe(200)

      expect((await owner.del(`${base}/links/${body.id}`)).status).toBe(204)
      expect((await open(replaced.body.url)).status).toBe(404)
      expect((await request(app).get('/api/guest/not-a-token')).status).toBe(404)
      expect((await request(app).get(`/api/guest/${'A'.repeat(43)}`)).status).toBe(404)
      expect((await owner.del(`${base}/links/${body.id}`)).status).toBe(404)
      expect((await owner.del(`${base}/links/nope`)).status).toBe(404)
   })

   it('expiry: not in the past; after it the page answers 410 without any content', async () => {
      const { owner, base } = await home()
      await owner.put(base, CONTENT)
      const past = await owner.post(`${base}/links`, { label: 'Old', sections: ['wifi'], expiresAt: '2026-11-17T22:59:59.999Z' })
      expect(past.status).toBe(400)
      const { body } = await owner.post(`${base}/links`, { label: 'Weekend', sections: ['wifi'], expiresAt: '2026-11-18T22:59:59.999Z' })
      expect((await open(body.url)).status).toBe(200)

      vi.setSystemTime(new Date('2026-11-19T08:00:00Z'))
      try {
         const gone = await open(body.url)
         expect(gone.status).toBe(410)
         expect(gone.body.message).toBe('This link has expired.')
         expect(JSON.stringify(gone.body)).not.toContain('Sunny')
         expect((await owner.get(`${base}/links`)).body[0]).toMatchObject({ expired: true })
         // Extending it brings it back.
         await owner.patch(`${base}/links/${body.id}`, { expiresAt: null })
         expect((await open(body.url)).status).toBe(200)
      } finally {
         vi.setSystemTime(NOW)
      }
   })

   it('at most 10 links per household; deleting the household removes content and links', async () => {
      const { owner, base, hid } = await home()
      await owner.put(base, CONTENT)
      const urls: string[] = []
      for (let i = 0; i < 10; i++) urls.push((await owner.post(`${base}/links`, { label: `L${i}`, sections: ['notes'] })).body.url)
      const eleventh = await owner.post(`${base}/links`, { label: 'L10', sections: ['notes'] })
      expect(eleventh.status).toBe(409)
      expect((await owner.post(`${base}/links`, { label: 'x', sections: [] })).status).toBe(400)

      expect((await owner.del(`/api/households/${hid}`)).status).toBe(204)
      expect(await GuestLink.countDocuments({ householdId: hid })).toBe(0)
      expect(await GuestInfo.countDocuments({ householdId: hid })).toBe(0)
      expect((await open(urls[0] ?? '')).status).toBe(404)
   })

   it('the public page has its own rate limit', async () => {
      const limited = createApp(env, { ...deps, guestPageLimit: 3 })
      const token = 'B'.repeat(43)
      const statuses: number[] = []
      for (let i = 0; i < 4; i++) statuses.push((await request(limited).get(`/api/guest/${token}`)).status)
      expect(statuses).toEqual([404, 404, 404, 429])
   })
})
