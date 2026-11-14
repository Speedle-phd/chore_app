import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Household } from '../models/householdModel'
import { Invitation } from '../models/invitationModel'
import { Membership } from '../models/membershipModel'
import { Session } from '../models/sessionModel'
import { User } from '../models/userModel'
import { useTestDatabase } from '../test/db'
import { signedInUser, TEST_PASSWORD } from '../test/users'

useTestDatabase()

let avatarDir = ''
let app: ReturnType<typeof createApp>
let png: Buffer

beforeAll(async () => {
   avatarDir = await mkdtemp(path.join(os.tmpdir(), 'avatars-'))
   app = createApp(
      loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'x', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: avatarDir }),
      {
         sendMail: async () => undefined,
         isBreached: async () => false,
         rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
      },
   )
   png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#477a68' } }).png().toBuffer()
})
afterAll(() => rm(avatarDir, { recursive: true, force: true }))

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string) => request(app).get(url).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string) => request(app).put(url).set(H).set('Cookie', cookie),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})
const files = () => readdir(avatarDir)

/** A second session for the same account (another device). */
async function loginAgain(email: string) {
   const res = await request(app).post('/api/auth/login').set(H).send({ email, password: TEST_PASSWORD })
   const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('__Host-session='))
   return raw?.split(';')[0] ?? ''
}

describe('profile', () => {
   it('updates names with validation', async () => {
      const { cookie } = await signedInUser(app, 'Ann')
      const res = await as(cookie).patch('/api/account', { fname: '  Annabel ', lname: 'Lee' })
      expect(res.body).toMatchObject({ fname: 'Annabel', lname: 'Lee', fullName: 'Annabel Lee' })
      expect((await as(cookie).patch('/api/account', { fname: '' })).status).toBe(400)
      expect((await as(cookie).patch('/api/account', { email: 'x@y.z' })).status).toBe(400) // unknown fields rejected
   })

   it('sets, replaces and removes a picture; old files are deleted; members see it', async () => {
      const { cookie } = await signedInUser(app, 'Pic')
      const hid = (await as(cookie).post('/api/households', { name: 'Home' })).body.id

      const first = await as(cookie).put('/api/account/avatar').attach('avatar', png, { filename: 'a.png', contentType: 'image/png' })
      expect(first.status).toBe(200)
      const firstFile = path.basename(first.body.avatarUrl)
      expect(await files()).toContain(firstFile)
      const members = await as(cookie).get(`/api/households/${hid}/members`)
      expect(members.body[0].avatarUrl).toBe(first.body.avatarUrl)

      const second = await as(cookie).put('/api/account/avatar').attach('avatar', png, { filename: 'b.png', contentType: 'image/png' })
      expect(await files()).not.toContain(firstFile)
      expect(await files()).toContain(path.basename(second.body.avatarUrl))

      const removed = await as(cookie).del('/api/account/avatar')
      expect(removed.body.avatarUrl).toBeNull()
      expect(await files()).not.toContain(path.basename(second.body.avatarUrl))
      expect((await as(cookie).put('/api/account/avatar')).status).toBe(400) // no file
   })
})

describe('signed-in devices', () => {
   it('lists my sessions with the current one marked, without exposing session ids', async () => {
      const { cookie, user } = await signedInUser(app, 'Dev')
      await loginAgain(user.email)
      const res = await as(cookie).get('/api/auth/sessions')
      expect(res.body).toHaveLength(2)
      expect(res.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1)
      const token = cookie.split('=')[1] ?? ''
      expect(JSON.stringify(res.body)).not.toContain(token)
      expect(Object.keys(res.body[0]).sort()).toEqual(['createdAt', 'current', 'id', 'lastSeenAt', 'userAgent'])
   })

   it('signs out one other device, but not the current one or someone else’s', async () => {
      const { cookie, user } = await signedInUser(app, 'Dev')
      const phone = await loginAgain(user.email)
      const stranger = await signedInUser(app, 'Stranger')
      const list = (await as(cookie).get('/api/auth/sessions')).body as { id: string; current: boolean }[]
      const current = list.find((s) => s.current)
      const other = list.find((s) => !s.current)

      expect((await as(cookie).del(`/api/auth/sessions/${current?.id}`)).status).toBe(404)
      expect((await as(stranger.cookie).del(`/api/auth/sessions/${other?.id}`)).status).toBe(404)
      expect((await as(phone).get('/api/auth/me')).status).toBe(200)

      expect((await as(cookie).del(`/api/auth/sessions/${other?.id}`)).status).toBe(204)
      expect((await as(phone).get('/api/auth/me')).status).toBe(401)
      expect((await as(cookie).get('/api/auth/me')).status).toBe(200)
   })

   it('signs out everywhere else in one go', async () => {
      const { cookie, user } = await signedInUser(app, 'Dev')
      const a = await loginAgain(user.email)
      const b = await loginAgain(user.email)
      const res = await as(cookie).del('/api/auth/sessions')
      expect(res.body.signedOut).toBe(2)
      expect((await as(a).get('/api/auth/me')).status).toBe(401)
      expect((await as(b).get('/api/auth/me')).status).toBe(401)
      expect((await as(cookie).get('/api/auth/me')).status).toBe(200)
   })
})

describe('deleting the account', () => {
   async function scenario() {
      const me = await signedInUser(app, 'Me')
      const solo = (await as(me.cookie).post('/api/households', { name: 'Solo' })).body.id
      const profile = await request(app)
         .post(`/api/households/${solo}/profiles`)
         .set(H)
         .set('Cookie', me.cookie)
         .field('fname', 'Kid')
         .field('lname', 'Solo')
         .attach('avatar', png, { filename: 'k.png', contentType: 'image/png' })
      const friend = await signedInUser(app, 'Friend')
      const theirs = (await as(friend.cookie).post('/api/households', { name: 'Theirs' })).body.id
      await Membership.create({ householdId: theirs, userId: me.user._id, role: 'member' })
      await as(me.cookie).post(`/api/households/${solo}/invitations`, { kind: 'link' })
      return { me, friend, solo, theirs, profileAvatar: path.basename(profile.body.avatarUrl) }
   }

   it('explains what will happen', async () => {
      const { me } = await scenario()
      const check = await as(me.cookie).get('/api/account/deletion-check')
      expect(check.body).toEqual({
         blockedBy: [],
         willDelete: [expect.objectContaining({ name: 'Solo' })],
         willLeave: [expect.objectContaining({ name: 'Theirs' })],
      })
   })

   it('needs the password and changes nothing when it’s wrong', async () => {
      const { me } = await scenario()
      const res = await as(me.cookie).post('/api/account/delete', { password: 'definitely not it' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('WRONG_PASSWORD')
      expect(await User.exists({ _id: me.user._id })).not.toBeNull()
   })

   it('is blocked while I’m the only owner of a household with other accounts', async () => {
      const { me, solo } = await scenario()
      const other = await signedInUser(app, 'Other')
      await Membership.create({ householdId: solo, userId: other.user._id, role: 'member' })
      expect((await as(me.cookie).get('/api/account/deletion-check')).body.blockedBy).toEqual([
         expect.objectContaining({ name: 'Solo' }),
      ])
      const res = await as(me.cookie).post('/api/account/delete', { password: TEST_PASSWORD })
      expect(res.status).toBe(409)
      expect(res.body.message).toMatch(/only owner of Solo/)
      expect(await User.exists({ _id: me.user._id })).not.toBeNull()
      expect(await Household.exists({ _id: solo })).not.toBeNull()
   })

   it('deletes the account, its solo household, its memberships, files and sessions', async () => {
      const { me, friend, solo, theirs, profileAvatar } = await scenario()
      await as(me.cookie).put('/api/account/avatar').attach('avatar', png, { filename: 'me.png', contentType: 'image/png' })
      const myAvatar = path.basename((await User.findById(me.user._id))?.avatarUrl ?? '')
      const otherDevice = await loginAgain(me.user.email)

      const res = await as(me.cookie).post('/api/account/delete', { password: TEST_PASSWORD })
      expect(res.status).toBe(204)
      expect(String(res.headers['set-cookie'])).toMatch(/__Host-session=;/)

      expect(await User.exists({ _id: me.user._id })).toBeNull()
      expect(await Session.countDocuments({ userId: me.user._id })).toBe(0)
      expect((await as(otherDevice).get('/api/auth/me')).status).toBe(401)
      expect(await Household.exists({ _id: solo })).toBeNull()
      expect(await Membership.countDocuments({ householdId: solo })).toBe(0)
      expect(await Invitation.countDocuments({ householdId: solo })).toBe(0)
      expect(await Household.exists({ _id: theirs })).not.toBeNull()
      expect(await Membership.exists({ householdId: theirs, userId: me.user._id })).toBeNull()
      expect((await as(friend.cookie).get(`/api/households/${theirs}/members`)).body).toHaveLength(1)
      const left = await files()
      expect(left).not.toContain(profileAvatar)
      expect(left).not.toContain(myAvatar)

      // The address is free again.
      expect((await request(app).post('/api/auth/login').set(H).send({ email: me.user.email, password: TEST_PASSWORD })).status).toBe(401)
      expect(
         (await request(app).post('/api/auth/signup').set(H).send({ fname: 'New', lname: 'Me', email: me.user.email, password: 'a brand new passphrase' })).status,
      ).toBe(202)
      expect(await User.exists({ email: me.user.email })).not.toBeNull()
   })

   it('revokes invitations I sent to households that live on', async () => {
      const owner = await signedInUser(app, 'Boss')
      const hid = (await as(owner.cookie).post('/api/households', { name: 'Shared' })).body.id
      const admin = await signedInUser(app, 'Adm')
      await Membership.create({ householdId: hid, userId: admin.user._id, role: 'admin' })
      await as(admin.cookie).post(`/api/households/${hid}/invitations`, { kind: 'link' })
      expect((await as(owner.cookie).get(`/api/households/${hid}/invitations`)).body).toHaveLength(1)
      expect((await as(admin.cookie).post('/api/account/delete', { password: TEST_PASSWORD })).status).toBe(204)
      expect((await as(owner.cookie).get(`/api/households/${hid}/invitations`)).body).toHaveLength(0)
   })
})
