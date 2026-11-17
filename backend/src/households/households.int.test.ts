import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Household } from '../models/householdModel'
import { Membership, type Role } from '../models/membershipModel'
import { User } from '../models/userModel'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

let avatarDir = ''
let app: ReturnType<typeof createApp>
let png: Buffer

beforeAll(async () => {
   avatarDir = await mkdtemp(path.join(os.tmpdir(), 'avatars-'))
   app = createApp(
      loadEnv({
         NODE_ENV: 'test',
         MONGODB_URI: 'set-by-useTestDatabase',
         MAILER_KEY: 'k'.repeat(32),
         AVATAR_UPLOAD_DIR: avatarDir,
      }),
      {
         sendMail: async () => undefined,
         isBreached: async () => false,
         rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
      },
   )
   png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#477a68' } }).png().toBuffer()
})
afterAll(async () => {
   await rm(avatarDir, { recursive: true, force: true })
})

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string) => request(app).get(url).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string) => request(app).put(url).set(H).set('Cookie', cookie),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
   upload: (url: string) => request(app).post(url).set(H).set('Cookie', cookie),
})

/** An owner with a household, plus helpers to add more people in given roles. */
async function household() {
   const owner = await signedInUser(app, 'Owner')
   const res = await as(owner.cookie).post('/api/households', { name: 'Schnuffis' })
   expect(res.status).toBe(201)
   const hid: string = res.body.id
   const join = async (role: Role, fname: string = role) => {
      const person = await signedInUser(app, fname)
      const membership = await Membership.create({ householdId: hid, userId: person.user._id, role })
      return { ...person, mid: membership.id as string }
   }
   const ownerMid = (await Membership.findOne({ householdId: hid, userId: owner.user._id }))?.id as string
   return { owner: { ...owner, mid: ownerMid }, hid, join, base: `/api/households/${hid}` }
}

const avatarFiles = async () => readdir(avatarDir)

describe('creating and listing households', () => {
   it('makes the creator owner and selects the new household', async () => {
      const { owner, hid } = await household()
      const list = await as(owner.cookie).get('/api/households')
      expect(list.body).toEqual([expect.objectContaining({ id: hid, name: 'Schnuffis', role: 'owner', memberCount: 1 })])
      expect((await as(owner.cookie).get('/api/auth/me')).body.lastHouseholdId).toBe(hid)
   })

   it('only lists households the user belongs to', async () => {
      await household()
      const stranger = await signedInUser(app, 'Stranger')
      expect((await as(stranger.cookie).get('/api/households')).body).toEqual([])
   })

   it('validates the name', async () => {
      const someone = await signedInUser(app)
      const res = await as(someone.cookie).post('/api/households', { name: '   ' })
      expect(res.status).toBe(400)
   })

   it('requires a session', async () => {
      expect((await request(app).get('/api/households')).status).toBe(401)
   })
})

describe('access boundary', () => {
   it('answers 404 to non-members for every household route, and doesn’t change anything', async () => {
      const { base, hid } = await household()
      const stranger = as((await signedInUser(app, 'Stranger')).cookie)
      for (const res of [
         await stranger.get(base),
         await stranger.get(`${base}/members`),
         await stranger.patch(base, { name: 'Hijacked' }),
         await stranger.del(base),
         await stranger.post(`${base}/select`),
         await stranger.upload(`${base}/profiles`).field('fname', 'X').field('lname', 'Y'),
      ]) {
         expect(res.status).toBe(404)
      }
      expect((await Household.findById(hid))?.name).toBe('Schnuffis')
      expect(await Membership.countDocuments({ householdId: hid })).toBe(1)
   })

   it('answers 404 for malformed ids', async () => {
      const someone = as((await signedInUser(app)).cookie)
      expect((await someone.get('/api/households/not-an-id')).status).toBe(404)
   })

   it('can’t reach a member of another household through your own', async () => {
      const a = await household()
      const b = await household()
      const res = await as(a.owner.cookie).del(`${a.base}/members/${b.owner.mid}`)
      expect(res.status).toBe(404)
      expect(await Membership.exists({ _id: b.owner.mid })).not.toBeNull()
   })
})

describe('members', () => {
   it('lists everyone with names, roles and emails for fellow members', async () => {
      const { base, join, owner } = await household()
      const member = await join('member', 'Mia')
      const res = await as(member.cookie).get(`${base}/members`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual([
         expect.objectContaining({ kind: 'account', role: 'owner', fname: 'Owner', email: owner.user.email, isMe: false }),
         expect.objectContaining({ kind: 'account', role: 'member', fname: 'Mia', isMe: true }),
      ])
   })

   it('stops plain members from managing anything', async () => {
      const { base, join, owner } = await household()
      const member = as((await join('member')).cookie)
      expect((await member.patch(base, { name: 'New' })).status).toBe(403)
      expect((await member.upload(`${base}/profiles`).field('fname', 'K').field('lname', 'L')).status).toBe(403)
      expect((await member.del(`${base}/members/${owner.mid}`)).status).toBe(403)
      expect((await member.patch(`${base}/members/${owner.mid}`, { role: 'member' })).status).toBe(403)
      expect((await member.del(base)).status).toBe(403)
   })
})

describe('profiles without login', () => {
   it('admins add and edit profiles; replaced and removed pictures are deleted', async () => {
      const { base, join } = await household()
      const admin = as((await join('admin')).cookie)

      const created = await admin
         .upload(`${base}/profiles`)
         .field('fname', 'Kid')
         .field('lname', 'One')
         .attach('avatar', png, { filename: 'a.png', contentType: 'image/png' })
      expect(created.status).toBe(201)
      expect(created.body).toMatchObject({ kind: 'profile', role: 'member', fullName: 'Kid One', email: null })
      const firstAvatar = path.basename(created.body.avatarUrl)
      expect(await avatarFiles()).toContain(firstAvatar)

      const updated = await admin
         .put(`${base}/profiles/${created.body.id}`)
         .field('fname', 'Kiddo')
         .field('lname', 'One')
         .attach('avatar', png, { filename: 'b.png', contentType: 'image/png' })
      expect(updated.status).toBe(200)
      expect(updated.body.fname).toBe('Kiddo')
      const secondAvatar = path.basename(updated.body.avatarUrl)
      expect(await avatarFiles()).toContain(secondAvatar)
      expect(await avatarFiles()).not.toContain(firstAvatar)

      expect((await admin.del(`${base}/members/${created.body.id}`)).status).toBe(204)
      expect(await avatarFiles()).not.toContain(secondAvatar)
   })

   it('keeps the picture when only the name changes', async () => {
      const { base, owner } = await household()
      const o = as(owner.cookie)
      const created = await o
         .upload(`${base}/profiles`)
         .field('fname', 'Pet')
         .field('lname', 'Cat')
         .attach('avatar', png, { filename: 'c.png', contentType: 'image/png' })
      const renamed = await o.put(`${base}/profiles/${created.body.id}`).field('fname', 'Kitty').field('lname', 'Cat')
      expect(renamed.body.avatarUrl).toBe(created.body.avatarUrl)
      expect(await avatarFiles()).toContain(path.basename(created.body.avatarUrl))
   })

   it('rejects non-image uploads and missing names', async () => {
      const { base, owner } = await household()
      const o = as(owner.cookie)
      const txt = await o
         .upload(`${base}/profiles`)
         .field('fname', 'A')
         .field('lname', 'B')
         .attach('avatar', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' })
      expect(txt.status).toBe(400)
      expect((await o.upload(`${base}/profiles`).field('fname', 'A')).status).toBe(400)
   })

   it('won’t edit an account member as a profile, or give a profile a role', async () => {
      const { base, owner, join } = await household()
      const member = await join('member')
      const o = as(owner.cookie)
      expect((await o.put(`${base}/profiles/${member.mid}`).field('fname', 'X').field('lname', 'Y')).status).toBe(400)
      const profile = await o.upload(`${base}/profiles`).field('fname', 'P').field('lname', 'Q')
      expect((await o.patch(`${base}/members/${profile.body.id}`, { role: 'admin' })).status).toBe(400)
   })
})

describe('roles and the last owner', () => {
   it('only owners change roles; admins can’t promote themselves', async () => {
      const { base, join } = await household()
      const admin = await join('admin')
      expect((await as(admin.cookie).patch(`${base}/members/${admin.mid}`, { role: 'owner' })).status).toBe(403)
      expect((await Membership.findById(admin.mid))?.role).toBe('admin')
   })

   it('keeps at least one owner', async () => {
      const { base, owner, join } = await household()
      const o = as(owner.cookie)
      expect((await o.patch(`${base}/members/${owner.mid}`, { role: 'member' })).status).toBe(409)

      const other = await join('member')
      expect((await o.patch(`${base}/members/${other.mid}`, { role: 'owner' })).status).toBe(204)
      expect((await o.patch(`${base}/members/${owner.mid}`, { role: 'member' })).status).toBe(204)
      expect((await Membership.findById(owner.mid))?.role).toBe('member')
   })

   it('admins remove members but not owners or other admins', async () => {
      const { base, owner, join } = await household()
      const admin = as((await join('admin', 'Ada')).cookie)
      const member = await join('member')
      const otherAdmin = await join('admin', 'Abe')
      expect((await admin.del(`${base}/members/${owner.mid}`)).status).toBe(403)
      expect((await admin.del(`${base}/members/${otherAdmin.mid}`)).status).toBe(403)
      expect((await admin.del(`${base}/members/${member.mid}`)).status).toBe(204)
      expect(await Membership.exists({ _id: member.mid })).toBeNull()
   })

   it('removing someone ends their access and clears their selected household', async () => {
      const { base, owner, join, hid } = await household()
      const member = await join('member')
      await as(member.cookie).post(`${base}/select`)
      expect((await User.findById(member.user._id))?.lastHouseholdId?.toString()).toBe(hid)

      await as(owner.cookie).del(`${base}/members/${member.mid}`)
      expect((await as(member.cookie).get(base)).status).toBe(404)
      expect((await User.findById(member.user._id))?.lastHouseholdId).toBeNull()
   })
})

describe('leaving and deleting', () => {
   it('members can leave; the last owner can’t', async () => {
      const { base, owner, join } = await household()
      const member = await join('member')
      expect((await as(member.cookie).post(`${base}/leave`)).status).toBe(204)
      expect(await Membership.exists({ _id: member.mid })).toBeNull()

      await join('member')
      const ownerLeaves = await as(owner.cookie).post(`${base}/leave`)
      expect(ownerLeaves.status).toBe(409)
      expect(ownerLeaves.body.message).toMatch(/Make someone else owner/)
   })

   it('only owners delete a household; everything in it goes', async () => {
      const { base, owner, join, hid } = await household()
      const admin = as((await join('admin')).cookie)
      const profile = await as(owner.cookie)
         .upload(`${base}/profiles`)
         .field('fname', 'Kid')
         .field('lname', 'Two')
         .attach('avatar', png, { filename: 'd.png', contentType: 'image/png' })

      expect((await admin.del(base)).status).toBe(403)
      expect((await as(owner.cookie).del(base)).status).toBe(204)
      expect(await Household.exists({ _id: hid })).toBeNull()
      expect(await Membership.countDocuments({ householdId: hid })).toBe(0)
      expect(await avatarFiles()).not.toContain(path.basename(profile.body.avatarUrl))
      expect((await User.findById(owner.user._id))?.lastHouseholdId).toBeNull()
   })
})

describe('region and public holidays', () => {
   it('is off by default and only managers can set the state', async () => {
      const { owner, join, base, hid } = await household()
      const member = await join('member')
      expect((await as(owner.cookie).get(base)).body.region).toEqual({ state: null })
      expect((await as(owner.cookie).get(`${base}/holidays?from=2026-01-01&to=2027-01-01`)).body).toEqual({ state: null, holidays: [] })

      expect((await as(member.cookie).patch(`${base}/region`, { state: 'BY' })).status).toBe(403)
      const res = await as(owner.cookie).patch(`${base}/region`, { state: 'BY' })
      expect(res.status).toBe(200)
      expect(res.body.region).toEqual({ state: 'BY' })
      expect((await Household.findById(hid).lean())?.region?.state).toBe('BY')

      expect((await as(owner.cookie).patch(`${base}/region`, { state: null })).body.region).toEqual({ state: null })
   })

   it('rejects unknown states and extra fields', async () => {
      const { owner, base } = await household()
      expect((await as(owner.cookie).patch(`${base}/region`, { state: 'XX' })).status).toBe(400)
      expect((await as(owner.cookie).patch(`${base}/region`, { state: 'BY', country: 'AT' })).status).toBe(400)
   })

   it('lists the state’s holidays for every member, end exclusive', async () => {
      const { owner, join, base } = await household()
      const member = await join('member')
      await as(owner.cookie).patch(`${base}/region`, { state: 'BY' })
      const res = await as(member.cookie).get(`${base}/holidays?from=2026-08-01&to=2026-11-01`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({
         state: 'BY',
         holidays: [
            { date: '2026-08-15', id: 'mariae-himmelfahrt', name: 'Mariä Himmelfahrt', partial: true },
            { date: '2026-10-03', id: 'tag-der-deutschen-einheit', name: 'Tag der Deutschen Einheit', partial: false },
         ],
      })
   })

   it('validates the range', async () => {
      const { owner, base } = await household()
      expect((await as(owner.cookie).get(`${base}/holidays?from=2026-02-01&to=2026-01-01`)).status).toBe(400)
      expect((await as(owner.cookie).get(`${base}/holidays?from=2026-01-01&to=2027-03-01`)).status).toBe(400)
      expect((await as(owner.cookie).get(`${base}/holidays?from=yesterday&to=2026-01-01`)).status).toBe(400)
   })

   it('answers 404 to non-members', async () => {
      const { base } = await household()
      const stranger = as((await signedInUser(app, 'Stranger')).cookie)
      expect((await stranger.get(`${base}/holidays?from=2026-01-01&to=2026-02-01`)).status).toBe(404)
      expect((await stranger.patch(`${base}/region`, { state: 'BY' })).status).toBe(404)
   })
})
