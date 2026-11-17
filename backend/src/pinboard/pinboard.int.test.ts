import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { Membership, type Role } from '../models/membershipModel'
import { Post } from '../models/postModel'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

const NOW = new Date('2026-11-17T10:00:00Z')
const HOUR = 3600_000

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
const later = (hours: number) => vi.setSystemTime(new Date(NOW.getTime() + hours * HOUR))
const notified = (hid: string) => notices.mock.calls.some((call: unknown[]) => String(call[0]) === hid && call[1] === 'pinboard')

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string) => request(app).get(url).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   put: (url: string, body: object) => request(app).put(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

type PostView = {
   id: string
   kind: 'note' | 'poll'
   text: string
   authorId: string
   pinned: boolean
   expiresAt: string | null
   editedAt: string | null
   createdAt: string
   poll: {
      multiple: boolean
      closesAt: string | null
      closedAt: string | null
      open: boolean
      voters: number
      options: { id: string; text: string; count: number; voterIds: string[] }[]
   } | null
}

async function home() {
   const ownerUser = await signedInUser(app, 'Owner')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const ownerMid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))?.id as string
   const base = `/api/households/${hid}`
   const posts = `${base}/posts`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      const m = await Membership.create({ householdId: hid, userId: person.user._id, role })
      return { ...as(person.cookie), mid: m.id as string }
   }
   const profile = async (fname: string) =>
      (await Membership.create({ householdId: hid, role: 'member', profile: { fname, lname: 'Kid' } })).id as string
   const list = async (who = owner) => (await who.get(posts)).body as PostView[]
   const poll = async (who: ReturnType<typeof as>, body: object = {}) =>
      (await who.post(posts, { kind: 'poll', text: 'Dinner Friday?', options: ['Pizza', 'Pasta', 'Curry'], ...body })).body as PostView
   notices.mockClear()
   return { hid, base, posts, owner, ownerMid, join, profile, list, poll }
}

describe('posts', () => {
   it('everyone posts notes and polls; newest first; input is validated; strangers get 404', async () => {
      const { hid, posts, owner, ownerMid, join, list } = await home()
      const member = await join('member')

      const note = await member.post(posts, { kind: 'note', text: '  Plumber comes Tuesday 9:00  ' })
      expect(note.status).toBe(201)
      expect(note.body).toMatchObject({ kind: 'note', text: 'Plumber comes Tuesday 9:00', authorId: member.mid, pinned: false, poll: null, editedAt: null })
      // Default: a week.
      expect(note.body.expiresAt).toBe('2026-11-24T10:00:00.000Z')
      expect(notified(hid)).toBe(true)

      later(1)
      const poll = await owner.post(posts, { kind: 'poll', text: 'Dinner?', options: ['Pizza', 'Pasta'], expiry: 'never', closes: 'day' })
      expect(poll.status).toBe(201)
      expect(poll.body).toMatchObject({ authorId: ownerMid, expiresAt: null, poll: { multiple: false, open: true, voters: 0, closesAt: '2026-11-18T11:00:00.000Z' } })
      expect(poll.body.poll.options.map((o: { text: string; count: number }) => [o.text, o.count])).toEqual([['Pizza', 0], ['Pasta', 0]])

      expect((await list(member)).map((p) => p.kind)).toEqual(['poll', 'note'])

      const bad = async (body: object) => (await owner.post(posts, body)).status
      expect(await bad({ kind: 'note', text: '   ' })).toBe(400)
      expect(await bad({ kind: 'note', text: 'x'.repeat(1001) })).toBe(400)
      expect(await bad({ kind: 'poll', text: 'Q?', options: ['Only one'] })).toBe(400)
      expect(await bad({ kind: 'poll', text: 'Q?', options: ['Same', 'same'] })).toBe(400)
      expect(await bad({ kind: 'poll', text: 'Q?', options: Array.from({ length: 11 }, (_, i) => `O${i}`) })).toBe(400)
      expect(await bad({ kind: 'note', text: 'x', expiry: 'year' })).toBe(400)
      expect(await bad({ kind: 'note', text: 'x', options: ['a', 'b'] })).toBe(400)

      const stranger = as((await signedInUser(app, 'Stranger')).cookie)
      expect((await stranger.get(posts)).status).toBe(404)
      expect((await owner.del(`${posts}/000000000000000000000000`)).status).toBe(404)
      expect((await owner.del(`${posts}/nope`)).status).toBe(404)
   })

   it('only the author edits; a poll’s question only before anyone voted', async () => {
      const { posts, owner, join, poll } = await home()
      const member = await join('member')
      const note = (await member.post(posts, { kind: 'note', text: 'Old' })).body as PostView
      expect((await owner.patch(`${posts}/${note.id}`, { text: 'Hijacked' })).status).toBe(403)
      later(2)
      const edited = await member.patch(`${posts}/${note.id}`, { text: 'New' })
      expect(edited.body).toMatchObject({ text: 'New', editedAt: '2026-11-17T12:00:00.000Z' })

      const p = await poll(owner)
      expect((await owner.patch(`${posts}/${p.id}`, { text: 'Lunch Friday?' })).body.text).toBe('Lunch Friday?')
      await owner.put(`${posts}/${p.id}/vote`, { optionIds: [p.poll?.options[0]?.id] })
      const locked = await owner.patch(`${posts}/${p.id}`, { text: 'Breakfast?' })
      expect(locked.status).toBe(409)
   })

   it('pinning: author or admins; pinned posts come first and never expire; unpinning gives a week', async () => {
      const { posts, join, list } = await home()
      const member = await join('member')
      const other = await join('member')
      const admin = await join('admin')
      const first = (await member.post(posts, { kind: 'note', text: 'First', expiry: 'day' })).body as PostView
      later(1)
      await member.post(posts, { kind: 'note', text: 'Second' })

      expect((await other.post(`${posts}/${first.id}/pin`)).status).toBe(403)
      const pinned = await admin.post(`${posts}/${first.id}/pin`)
      expect(pinned.body).toMatchObject({ pinned: true, expiresAt: null })
      expect((await list()).map((p) => p.text)).toEqual(['First', 'Second'])

      // Past its original day: still there while pinned.
      later(30)
      expect((await list()).map((p) => p.text)).toContain('First')
      const unpinned = await member.post(`${posts}/${first.id}/unpin`)
      expect(unpinned.body).toMatchObject({ pinned: false, expiresAt: '2026-11-25T16:00:00.000Z' })
   })

   it('expired posts disappear from the board and can’t be changed', async () => {
      const { posts, owner, list } = await home()
      const p = (await owner.post(posts, { kind: 'note', text: 'Short-lived', expiry: 'day' })).body as PostView
      later(23)
      expect((await list()).map((x) => x.id)).toEqual([p.id])
      later(25)
      expect(await list()).toEqual([])
      expect((await owner.post(`${posts}/${p.id}/pin`)).status).toBe(404)
   })

   it('deleting: author or admins; deleting the household removes its posts', async () => {
      const { hid, base, posts, owner, join } = await home()
      const member = await join('member')
      const other = await join('member')
      const p = (await member.post(posts, { kind: 'note', text: 'Mine' })).body as PostView
      expect((await other.del(`${posts}/${p.id}`)).status).toBe(403)
      expect((await member.del(`${posts}/${p.id}`)).status).toBe(204)
      const q = (await member.post(posts, { kind: 'note', text: 'Again' })).body as PostView
      expect((await owner.del(`${posts}/${q.id}`)).status).toBe(204)

      await member.post(posts, { kind: 'note', text: 'Stays until the household goes' })
      expect((await owner.del(base)).status).toBe(204)
      expect(await Post.countDocuments({ householdId: hid })).toBe(0)
   })
})

describe('polls', () => {
   it('named votes: vote, change, withdraw; results list who voted for what', async () => {
      const { posts, owner, ownerMid, join, poll } = await home()
      const member = await join('member')
      const p = await poll(owner)
      const [pizza, pasta, curry] = (p.poll?.options ?? []).map((o) => o.id)

      await owner.put(`${posts}/${p.id}/vote`, { optionIds: [pizza] })
      later(1)
      let r = (await member.put(`${posts}/${p.id}/vote`, { optionIds: [pizza] })).body as PostView
      expect(r.poll?.voters).toBe(2)
      expect(r.poll?.options[0]).toMatchObject({ text: 'Pizza', count: 2, voterIds: [ownerMid, member.mid] })

      r = (await member.put(`${posts}/${p.id}/vote`, { optionIds: [curry] })).body
      expect(r.poll?.options.map((o) => o.count)).toEqual([1, 0, 1])
      r = (await owner.put(`${posts}/${p.id}/vote`, { optionIds: [] })).body
      expect(r.poll?.voters).toBe(1)
      expect(r.poll?.options.map((o) => o.voterIds)).toEqual([[], [], [member.mid]])

      // Single choice: one option only; unknown options refused.
      expect((await owner.put(`${posts}/${p.id}/vote`, { optionIds: [pizza, pasta] })).status).toBe(400)
      expect((await owner.put(`${posts}/${p.id}/vote`, { optionIds: ['000000000000000000000000'] })).status).toBe(400)
      // Notes can't be voted on.
      const note = (await owner.post(posts, { kind: 'note', text: 'n' })).body as PostView
      expect((await owner.put(`${posts}/${note.id}/vote`, { optionIds: [] })).status).toBe(400)
   })

   it('multiple choice allows several options', async () => {
      const { posts, owner, poll } = await home()
      const p = await poll(owner, { multiple: true, text: 'Who’s home Saturday?' })
      const ids = (p.poll?.options ?? []).map((o) => o.id)
      const r = (await owner.put(`${posts}/${p.id}/vote`, { optionIds: [ids[0], ids[2]] })).body as PostView
      expect(r.poll?.options.map((o) => o.count)).toEqual([1, 0, 1])
      expect(r.poll?.voters).toBe(1)
   })

   it('votes for profiles by anyone; not for another account', async () => {
      const { posts, owner, ownerMid, join, profile, poll } = await home()
      const member = await join('member')
      const kid = await profile('Mia')
      const p = await poll(owner)
      const pizza = p.poll?.options[0]?.id
      const forKid = await member.put(`${posts}/${p.id}/vote`, { memberId: kid, optionIds: [pizza] })
      expect(forKid.body.poll.options[0].voterIds).toEqual([kid])
      expect((await member.put(`${posts}/${p.id}/vote`, { memberId: ownerMid, optionIds: [pizza] })).status).toBe(403)
      expect((await member.put(`${posts}/${p.id}/vote`, { memberId: '000000000000000000000000', optionIds: [pizza] })).status).toBe(400)
   })

   it('votes at the same moment are all kept', async () => {
      const { posts, owner, join, poll } = await home()
      const people = await Promise.all([join('member'), join('member'), join('member'), join('member')])
      const p = await poll(owner)
      const pizza = p.poll?.options[0]?.id
      await Promise.all(people.map((x) => x.put(`${posts}/${p.id}/vote`, { optionIds: [pizza] })))
      const stored = await Post.findById(p.id).lean()
      expect(stored?.poll?.votes).toHaveLength(4)
   })

   it('closing: by hand (author or admins) or at its closing time; no votes after', async () => {
      const { posts, owner, join, poll, list } = await home()
      const member = await join('member')
      const p = await poll(member)
      const pizza = p.poll?.options[0]?.id
      expect((await owner.post(`${posts}/${p.id}/close`)).status).toBe(200) // owner = admin+
      expect((await member.post(`${posts}/${p.id}/close`)).status).toBe(409)
      const late = await member.put(`${posts}/${p.id}/vote`, { optionIds: [pizza] })
      expect(late.status).toBe(409)
      expect(late.body.message).toBe('This poll is closed.')

      const other = await join('member')
      const q = await poll(member, { closes: 'day' })
      expect((await other.post(`${posts}/${q.id}/close`)).status).toBe(403)
      later(25)
      expect((await list()).find((x) => x.id === q.id)?.poll?.open).toBe(false)
      expect((await member.put(`${posts}/${q.id}/vote`, { optionIds: [q.poll?.options[0]?.id] })).status).toBe(409)
      const note = (await member.post(posts, { kind: 'note', text: 'n' })).body as PostView
      expect((await member.post(`${posts}/${note.id}/close`)).status).toBe(400)
   })
})
