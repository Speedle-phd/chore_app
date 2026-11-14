import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import type { MailTemplate } from '../mail/mailer'
import { Invitation } from '../models/invitationModel'
import { Membership, type Role } from '../models/membershipModel'
import { User } from '../models/userModel'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

type Sent = { template: MailTemplate; to: string; data: Record<string, unknown> }
const outbox: Sent[] = []
let avatarDir = ''
let app: ReturnType<typeof createApp>

beforeAll(async () => {
   avatarDir = await mkdtemp(path.join(os.tmpdir(), 'avatars-'))
   app = createApp(
      loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'x', MAILER_KEY: 'k'.repeat(32), AVATAR_UPLOAD_DIR: avatarDir }),
      {
         sendMail: async (template, to, data) => {
            outbox.push({ template, to, data })
         },
         isBreached: async () => false,
         rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
      },
   )
})
afterAll(() => rm(avatarDir, { recursive: true, force: true }))
beforeEach(() => {
   outbox.length = 0
})

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string) => request(app).get(url).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})
const tokenOf = (link: unknown) => new URL(String(link)).searchParams.get('token') ?? ''

async function household() {
   const owner = await signedInUser(app, 'Owner')
   const hid: string = (await as(owner.cookie).post('/api/households', { name: 'Schnuffis' })).body.id
   const base = `/api/households/${hid}`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      await Membership.create({ householdId: hid, userId: person.user._id, role })
      return person
   }
   return { owner, hid, base, join, invite: (body: object, cookie = owner.cookie) => as(cookie).post(`${base}/invitations`, body) }
}
const membersOf = (hid: string) => Membership.countDocuments({ householdId: hid })

describe('who may invite', () => {
   it('owners and admins invite; members can’t; outsiders get 404', async () => {
      const { invite, join } = await household()
      const admin = await join('admin')
      const member = await join('member')
      const stranger = await signedInUser(app, 'Stranger')
      expect((await invite({ kind: 'email', email: 'a@example.test' }, admin.cookie)).status).toBe(201)
      expect((await invite({ kind: 'email', email: 'b@example.test' }, member.cookie)).status).toBe(403)
      expect((await invite({ kind: 'email', email: 'c@example.test' }, stranger.cookie)).status).toBe(404)
   })

   it('only owners invite admins, and nobody invites owners', async () => {
      const { invite, join } = await household()
      const admin = await join('admin')
      expect((await invite({ kind: 'link', role: 'admin' }, admin.cookie)).status).toBe(403)
      expect((await invite({ kind: 'link', role: 'admin' })).status).toBe(201)
      expect((await invite({ kind: 'link', role: 'owner' })).status).toBe(400)
   })
})

describe('email invitations', () => {
   it('emails a link; only the invited address can accept, once', async () => {
      const { invite, hid } = await household()
      const invitee = await signedInUser(app, 'Ivy')
      const other = await signedInUser(app, 'Otto')

      const res = await invite({ kind: 'email', email: invitee.user.email.toUpperCase() })
      expect(res.status).toBe(201)
      expect(res.body.emailSent).toBe(true)
      expect(res.body.invitation).not.toHaveProperty('tokenHash')
      const mail = outbox.at(-1)
      expect(mail).toMatchObject({ template: 'invitation', to: invitee.user.email })
      const token = tokenOf(mail?.data.link)
      expect(await Invitation.exists({ tokenHash: token })).toBeNull() // only the hash is stored

      const preview = await request(app).get('/api/invitations/preview').query({ token })
      expect(preview.status).toBe(200)
      expect(preview.body).toMatchObject({ household: 'Schnuffis', inviter: 'Owner User', role: 'member' })
      expect(preview.body.emailHint).toMatch(/^i•+@example\.test$/)

      const wrong = await as(other.cookie).post('/api/invitations/accept', { token })
      expect(wrong.status).toBe(403)
      expect(wrong.body.code).toBe('WRONG_ACCOUNT')

      const ok = await as(invitee.cookie).post('/api/invitations/accept', { token })
      expect(ok.status).toBe(200)
      expect(ok.body).toMatchObject({ id: hid, role: 'member', memberCount: 2 })
      expect((await User.findById(invitee.user._id))?.lastHouseholdId?.toString()).toBe(hid)

      // A used link is simply invalid now (same answer as unknown/expired).
      expect((await as(invitee.cookie).post('/api/invitations/accept', { token })).status).toBe(404)
      expect((await request(app).get('/api/invitations/preview').query({ token })).status).toBe(404)
   })

   it('shows up in-app for the matching account, which can accept or decline by id', async () => {
      const { invite, hid } = await household()
      const invitee = await signedInUser(app, 'Ivy')
      await invite({ kind: 'email', email: invitee.user.email })
      const mine = await as(invitee.cookie).get('/api/invitations/mine')
      expect(mine.body).toEqual([expect.objectContaining({ household: 'Schnuffis', kind: 'email' })])
      const stranger = await signedInUser(app, 'Stranger')
      expect((await as(stranger.cookie).post(`/api/invitations/${mine.body[0].id}/accept`)).status).toBe(404)
      expect((await as(invitee.cookie).post(`/api/invitations/${mine.body[0].id}/accept`)).status).toBe(200)
      expect(await Membership.exists({ householdId: hid, userId: invitee.user._id })).not.toBeNull()
      expect((await as(invitee.cookie).get('/api/invitations/mine')).body).toEqual([])
   })

   it('declined, revoked and expired invitations can’t be used', async () => {
      const { invite, base } = await household()
      const a = await signedInUser(app, 'Ann')
      await invite({ kind: 'email', email: a.user.email })
      const id = (await as(a.cookie).get('/api/invitations/mine')).body[0].id
      expect((await as(a.cookie).post(`/api/invitations/${id}/decline`)).status).toBe(204)
      expect((await as(a.cookie).post(`/api/invitations/${id}/accept`)).status).toBe(404)

      const b = await signedInUser(app, 'Bob')
      const created = await invite({ kind: 'email', email: b.user.email })
      const token = tokenOf(outbox.at(-1)?.data.link)
      const { owner } = await household() // unrelated owner can't revoke it
      expect((await as(owner.cookie).del(`${base}/invitations/${created.body.invitation.id}`)).status).toBe(404)

      await Invitation.updateOne({ _id: created.body.invitation.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
      expect((await as(b.cookie).post('/api/invitations/accept', { token })).status).toBe(404)
   })

   it('revoking and resending: a resend invalidates the old link', async () => {
      const { invite, base, owner } = await household()
      const inv = (await invite({ kind: 'email', email: 'later@example.test' })).body.invitation
      const firstToken = tokenOf(outbox.at(-1)?.data.link)
      const resent = await as(owner.cookie).post(`${base}/invitations/${inv.id}/resend`)
      expect(resent.status).toBe(200)
      const secondToken = tokenOf(outbox.at(-1)?.data.link)
      expect(secondToken).not.toBe(firstToken)
      expect((await request(app).get('/api/invitations/preview').query({ token: firstToken })).status).toBe(404)
      expect((await request(app).get('/api/invitations/preview').query({ token: secondToken })).status).toBe(200)

      expect((await as(owner.cookie).del(`${base}/invitations/${inv.id}`)).status).toBe(204)
      expect((await request(app).get('/api/invitations/preview').query({ token: secondToken })).status).toBe(404)
      expect((await as(owner.cookie).get(`${base}/invitations`)).body).toEqual([])
   })

   it('refuses duplicates and existing members', async () => {
      const { invite, join } = await household()
      const member = await join('member')
      await invite({ kind: 'email', email: 'dup@example.test' })
      expect((await invite({ kind: 'email', email: 'DUP@example.test' })).status).toBe(409)
      expect((await invite({ kind: 'email', email: member.user.email })).status).toBe(409)
   })
})

describe('share links', () => {
   it('returns the link once, never lists the token, and enforces max uses', async () => {
      const { invite, base, owner, hid } = await household()
      const res = await invite({ kind: 'link', maxUses: 2 })
      expect(res.status).toBe(201)
      const token = tokenOf(res.body.url)
      const listed = await as(owner.cookie).get(`${base}/invitations`)
      expect(JSON.stringify(listed.body)).not.toContain(token)

      const [a, b, c] = await Promise.all([signedInUser(app, 'A'), signedInUser(app, 'B'), signedInUser(app, 'C')])
      expect((await as(a.cookie).post('/api/invitations/accept', { token })).status).toBe(200)
      expect((await as(b.cookie).post('/api/invitations/accept', { token })).status).toBe(200)
      expect((await as(c.cookie).post('/api/invitations/accept', { token })).status).toBe(404)
      expect(await membersOf(hid)).toBe(3)
   })

   it('never lets two people take the last use', async () => {
      const { invite, hid } = await household()
      const token = tokenOf((await invite({ kind: 'link', maxUses: 1 })).body.url)
      const people = await Promise.all([1, 2, 3, 4].map((i) => signedInUser(app, `Racer${i}`)))
      const results = await Promise.all(people.map((p) => as(p.cookie).post('/api/invitations/accept', { token })))
      expect(results.filter((r) => r.status === 200)).toHaveLength(1)
      expect(await membersOf(hid)).toBe(2)
   })

   it('says so when you’re already a member', async () => {
      const { invite, owner } = await household()
      const token = tokenOf((await invite({ kind: 'link' })).body.url)
      expect((await as(owner.cookie).post('/api/invitations/accept', { token })).status).toBe(409)
   })
})

describe('handle search and user invitations', () => {
   it('finds only exact handles of people who opted in, never yourself', async () => {
      const seeker = await signedInUser(app, 'Seeker')
      const hidden = await signedInUser(app, 'Hidden')
      const shown = await signedInUser(app, 'Shown')
      expect((await as(hidden.cookie).patch('/api/account', { handle: 'hidden.one' })).status).toBe(200)
      expect((await as(shown.cookie).patch('/api/account', { handle: 'Shown_One', findableByHandle: true })).body).toMatchObject({
         handle: 'shown_one',
         findableByHandle: true,
      })
      const search = (q: string, cookie = seeker.cookie) => as(cookie).get('/api/users/search').query({ handle: q })
      expect((await search('hidden.one')).body).toBeNull()
      expect((await search('@SHOWN_ONE')).body).toEqual({ id: shown.user.id, fullName: 'Shown User', handle: 'shown_one' })
      expect((await search('shown')).body).toBeNull() // no partial matches
      expect((await search('shown_one', shown.cookie)).body).toBeNull()
      expect((await request(app).get('/api/users/search').query({ handle: 'shown_one' })).status).toBe(401)
   })

   it('validates handles and keeps them unique (case-insensitive)', async () => {
      const a = await signedInUser(app, 'Alpha')
      const b = await signedInUser(app, 'Beta')
      expect((await as(a.cookie).patch('/api/account', { handle: 'x' })).status).toBe(400)
      expect((await as(a.cookie).patch('/api/account', { handle: 'no spaces' })).status).toBe(400)
      expect((await as(a.cookie).patch('/api/account', { handle: 'taken.name' })).status).toBe(200)
      expect((await as(b.cookie).patch('/api/account', { handle: 'TAKEN.NAME' })).status).toBe(409)
      expect((await as(b.cookie).patch('/api/account', { findableByHandle: true })).body.findableByHandle).toBe(false) // no handle → not findable
   })

   it('invites a findable account in-app and by email; nobody else can accept it', async () => {
      const { invite, hid } = await household()
      const target = await signedInUser(app, 'Target')
      const unfindable = await signedInUser(app, 'Quiet')
      await as(target.cookie).patch('/api/account', { handle: 'target', findableByHandle: true })
      expect((await invite({ kind: 'user', userId: unfindable.user.id })).status).toBe(404)

      const res = await invite({ kind: 'user', userId: target.user.id, role: 'admin' })
      expect(res.status).toBe(201)
      expect(outbox.at(-1)).toMatchObject({ template: 'invitation', to: target.user.email })
      expect(String(outbox.at(-1)?.data.link)).toBe('http://localhost:5173/invitations')

      const id = (await as(target.cookie).get('/api/invitations/mine')).body[0].id
      expect((await as(unfindable.cookie).post(`/api/invitations/${id}/accept`)).status).toBe(404)
      const accepted = await as(target.cookie).post(`/api/invitations/${id}/accept`)
      expect(accepted.body.role).toBe('admin')
      expect((await Membership.findOne({ householdId: hid, userId: target.user._id }))?.role).toBe('admin')
   })
})

describe('claiming a profile', () => {
   it('the invitee takes over the profile: same membership id, old picture deleted', async () => {
      const { invite, base, owner, hid } = await household()
      const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#e8b86d' } }).png().toBuffer()
      const profile = await request(app)
         .post(`${base}/profiles`)
         .set(H)
         .set('Cookie', owner.cookie)
         .field('fname', 'Kid')
         .field('lname', 'Grown')
         .attach('avatar', png, { filename: 'k.png', contentType: 'image/png' })
      const picture = path.basename(profile.body.avatarUrl)
      expect(await readdir(avatarDir)).toContain(picture)

      const kid = await signedInUser(app, 'Kid')
      const res = await invite({ kind: 'email', email: kid.user.email, claimsMembershipId: profile.body.id })
      expect(res.body.invitation.claims).toEqual({ id: profile.body.id, fullName: 'Kid Grown' })
      expect(outbox.at(-1)?.data.claims).toBe('Kid Grown')

      expect((await as(kid.cookie).post('/api/invitations/accept', { token: tokenOf(outbox.at(-1)?.data.link) })).status).toBe(200)
      const claimed = await Membership.findById(profile.body.id)
      expect(claimed?.userId?.toString()).toBe(kid.user.id)
      expect(claimed?.profile).toBeNull()
      expect(await membersOf(hid)).toBe(2) // no extra membership
      expect(await readdir(avatarDir)).not.toContain(picture)
   })

   it('rejects claiming a profile from another household or an account member', async () => {
      const a = await household()
      const b = await household()
      const foreign = await request(app)
         .post(`${b.base}/profiles`)
         .set(H)
         .set('Cookie', b.owner.cookie)
         .field('fname', 'Not')
         .field('lname', 'Yours')
      expect((await a.invite({ kind: 'email', email: 'x@example.test', claimsMembershipId: foreign.body.id })).status).toBe(400)
      const ownerMid = (await Membership.findOne({ householdId: a.hid }))?.id
      expect((await a.invite({ kind: 'email', email: 'y@example.test', claimsMembershipId: ownerMid })).status).toBe(400)
   })
})

describe('preview', () => {
   it('works without a session but rejects unknown tokens', async () => {
      expect((await request(app).get('/api/invitations/preview').query({ token: 'x'.repeat(43) })).status).toBe(404)
      expect((await request(app).get('/api/invitations/preview')).status).toBe(400)
   })

   it('deleting a household deletes its invitations', async () => {
      const { invite, base, owner, hid } = await household()
      await invite({ kind: 'link' })
      await as(owner.cookie).del(base)
      expect(await Invitation.countDocuments({ householdId: hid })).toBe(0)
   })
})
