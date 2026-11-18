import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import { ChatMessage } from '../models/chatMessageModel'
import { Membership, type Role } from '../models/membershipModel'
import { realtime } from '../socket/realtime'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'

useTestDatabase()

const NOW = new Date('2026-11-17T10:00:00Z')

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
/** Moves the clock on, so messages get distinct times. */
let tick = 0
const step = () => vi.setSystemTime(new Date(NOW.getTime() + ++tick * 1000))
const notified = (hid: string) => notices.mock.calls.some((call: unknown[]) => String(call[0]) === hid && call[1] === 'chat')

const H = { 'X-Requested-With': 'fetch' }
const as = (cookie: string) => ({
   get: (url: string, query: Record<string, string> = {}) => request(app).get(url).query(query).set('Cookie', cookie),
   post: (url: string, body: object = {}) => request(app).post(url).set(H).set('Cookie', cookie).send(body),
   patch: (url: string, body: object) => request(app).patch(url).set(H).set('Cookie', cookie).send(body),
   del: (url: string) => request(app).delete(url).set(H).set('Cookie', cookie),
})

type Message = { id: string; authorId: string; text: string; deleted: boolean; editedAt: string | null; createdAt: string }

async function home() {
   const ownerUser = await signedInUser(app, 'Owner')
   const owner = as(ownerUser.cookie)
   const hid: string = (await owner.post('/api/households', { name: 'Home' })).body.id
   const ownerMid = (await Membership.findOne({ householdId: hid, userId: ownerUser.user._id }))?.id as string
   const base = `/api/households/${hid}`
   const chat = `${base}/chat`
   const join = async (role: Role) => {
      const person = await signedInUser(app, role)
      const m = await Membership.create({ householdId: hid, userId: person.user._id, role })
      return { ...as(person.cookie), mid: m.id as string }
   }
   const send = async (who: ReturnType<typeof as>, text: string) => {
      step()
      const res = await who.post(`${chat}/messages`, { text })
      expect(res.status).toBe(201)
      return res.body as Message
   }
   const unread = async (who: ReturnType<typeof as>) => ((await who.get(`${chat}/unread`)).body as { count: number }).count
   notices.mockClear()
   return { hid, base, chat, owner, ownerMid, join, send, unread }
}

describe('household chat', () => {
   it('members send messages; they come oldest first; input is checked; strangers get 404', async () => {
      const { hid, chat, owner, ownerMid, join, send } = await home()
      const member = await join('member')
      const first = await send(owner, '  Who has the car keys?  ')
      expect(first).toMatchObject({ authorId: ownerMid, text: 'Who has the car keys?', deleted: false, editedAt: null })
      expect(notified(hid)).toBe(true)
      await send(member, 'On the hook by the door')

      const page = (await member.get(`${chat}/messages`)).body
      expect(page.hasMore).toBe(false)
      expect(page.messages.map((m: Message) => m.text)).toEqual(['Who has the car keys?', 'On the hook by the door'])

      expect((await owner.post(`${chat}/messages`, { text: '   ' })).status).toBe(400)
      expect((await owner.post(`${chat}/messages`, { text: 'x'.repeat(2001) })).status).toBe(400)
      const stranger = as((await signedInUser(app, 'Stranger')).cookie)
      expect((await stranger.get(`${chat}/messages`)).status).toBe(404)
      expect((await stranger.post(`${chat}/messages`, { text: 'hi' })).status).toBe(404)
   })

   it('pages: the newest first, then earlier ones before a message', async () => {
      const { chat, owner, send } = await home()
      for (let i = 1; i <= 5; i++) await send(owner, `m${i}`)
      const newest = (await owner.get(`${chat}/messages`, { limit: '2' })).body
      expect(newest.messages.map((m: Message) => m.text)).toEqual(['m4', 'm5'])
      expect(newest.hasMore).toBe(true)
      const earlier = (await owner.get(`${chat}/messages`, { limit: '2', before: newest.messages[0].id })).body
      expect(earlier.messages.map((m: Message) => m.text)).toEqual(['m2', 'm3'])
      const first = (await owner.get(`${chat}/messages`, { limit: '2', before: earlier.messages[0].id })).body
      expect(first).toMatchObject({ hasMore: false })
      expect(first.messages.map((m: Message) => m.text)).toEqual(['m1'])
      expect((await owner.get(`${chat}/messages`, { limit: '500' })).status).toBe(400)
   })

   it('authors edit their own; authors or admins remove (the place stays, the text is gone)', async () => {
      const { chat, owner, join, send } = await home()
      const member = await join('member')
      const other = await join('member')
      const msg = await send(member, 'Typo heer')

      expect((await other.patch(`${chat}/messages/${msg.id}`, { text: 'Hijack' })).status).toBe(403)
      expect((await owner.patch(`${chat}/messages/${msg.id}`, { text: 'Hijack' })).status).toBe(403) // admins can't edit others' words
      step()
      const edited = await member.patch(`${chat}/messages/${msg.id}`, { text: 'Typo here' })
      expect(edited.body).toMatchObject({ text: 'Typo here', deleted: false })
      expect(Date.parse(edited.body.editedAt)).toBeGreaterThan(Date.parse(msg.createdAt))

      expect((await other.del(`${chat}/messages/${msg.id}`)).status).toBe(403)
      const removed = await owner.del(`${chat}/messages/${msg.id}`)
      expect(removed.body).toMatchObject({ deleted: true, text: '', editedAt: null })
      expect((await ChatMessage.findById(msg.id).lean())?.text).toBe('')
      expect((await member.patch(`${chat}/messages/${msg.id}`, { text: 'back' })).status).toBe(409)
      // Removing again is harmless.
      expect((await member.del(`${chat}/messages/${msg.id}`)).status).toBe(200)

      const page = (await other.get(`${chat}/messages`)).body
      expect(page.messages).toEqual([expect.objectContaining({ id: msg.id, deleted: true, text: '' })])
      expect((await owner.del(`${chat}/messages/000000000000000000000000`)).status).toBe(404)
   })

   it('unread: others’ messages since you last read (since joining at first); reading only moves forward', async () => {
      const { chat, owner, join, send, unread } = await home()
      await send(owner, 'Before Ben joined')
      step()
      const ben = await join('member')
      expect(await unread(ben)).toBe(0) // older messages don't count as new

      const a = await send(owner, 'One')
      await send(owner, 'Two')
      await send(ben, 'My own never counts')
      // Sending counts as having read everything up to your message.
      expect(await unread(ben)).toBe(0)
      await send(owner, 'Three')
      const removed = await send(owner, 'Removed soon')
      await owner.del(`${chat}/messages/${removed.id}`)
      expect(await unread(ben)).toBe(1) // removed ones don't count

      // The owner's own messages count as read up to them; Ben's two newer ones are unread.
      expect(await unread(owner)).toBe(0)
      await send(ben, 'Ok')
      const latest = await send(ben, 'See you')
      expect(await unread(owner)).toBe(2)
      const read = await owner.post(`${chat}/read`, { upTo: latest.id })
      expect(read.body.count).toBe(0)
      // An older position doesn't move it back.
      expect((await owner.post(`${chat}/read`, { upTo: a.id })).body.count).toBe(0)
      expect((await owner.post(`${chat}/read`, { upTo: 'nope' })).status).toBe(400)
   })

   it('reactions: anyone toggles an emoji; grouped with who; a removed message loses them', async () => {
      const { hid, chat, owner, ownerMid, join, send } = await home()
      const ben = await join('member')
      const msg = await send(owner, 'Pizza tonight?')
      const react = (who: ReturnType<typeof as>, emoji: string) => who.post(`${chat}/messages/${msg.id}/reactions`, { emoji })

      notices.mockClear()
      step()
      expect((await react(ben, '👍')).body.reactions).toEqual([{ emoji: '👍', count: 1, memberIds: [ben.mid] }])
      expect(notified(hid)).toBe(true)
      step()
      await react(owner, '😂')
      step()
      const both = (await react(owner, '👍')).body
      expect(both.reactions).toEqual([
         { emoji: '👍', count: 2, memberIds: [ben.mid, ownerMid] },
         { emoji: '😂', count: 1, memberIds: [ownerMid] },
      ])
      // Again = taken back.
      const after = (await react(ben, '👍')).body.reactions as { emoji: string }[]
      expect(after.find((r) => r.emoji === '👍')).toEqual({ emoji: '👍', count: 1, memberIds: [ownerMid] })

      // Two clicks at once never count twice.
      await Promise.all([react(ben, '🎉'), react(ben, '🎉')])
      const stored = await ChatMessage.findById(msg.id).lean()
      expect(stored?.reactions.filter((r) => r.emoji === '🎉').length).toBeLessThanOrEqual(1)

      // Only one emoji, nothing else.
      expect((await react(ben, 'ok')).status).toBe(400)
      expect((await react(ben, '👍👍')).status).toBe(400)
      expect((await react(ben, '<img>')).status).toBe(400)

      await owner.del(`${chat}/messages/${msg.id}`)
      expect((await react(ben, '👍')).status).toBe(409)
      expect((await ben.get(`${chat}/messages`)).body.messages[0].reactions).toEqual([])
   })

   it('deleting the household removes its messages', async () => {
      const { hid, base, owner, send } = await home()
      await send(owner, 'bye')
      expect((await owner.del(base)).status).toBe(204)
      expect(await ChatMessage.countDocuments({ householdId: hid })).toBe(0)
   })
})
