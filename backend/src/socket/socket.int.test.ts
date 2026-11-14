import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { createSessions, sessionConfig } from '../auth/sessions'
import { loadEnv } from '../config/env'
import { Membership } from '../models/membershipModel'
import { useTestDatabase } from '../test/db'
import { signedInUser } from '../test/users'
import type { ClientToServerEvents, ServerToClientEvents } from './contracts'
import { createSocketServer } from './index'
import { initRealtime } from './realtime'

useTestDatabase()

const ORIGIN = 'http://localhost:5173'
const env = loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'x', MAILER_KEY: 'k'.repeat(32), APP_URL: ORIGIN })
const app = createApp(env, {
   sendMail: async () => undefined,
   isBreached: async () => false,
   rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
})
let httpServer: HttpServer
let url = ''
const clients: ClientSocket[] = []

beforeAll(async () => {
   httpServer = createServer(app)
   createSocketServer(httpServer, env, createSessions(sessionConfig(true)), { presenceGraceMs: 0 })
   await new Promise<void>((resolve) => httpServer.listen(0, resolve))
   url = `http://localhost:${(httpServer.address() as AddressInfo).port}`
})
afterEach(() => {
   for (const c of clients.splice(0)) c.disconnect()
})
afterAll(async () => {
   initRealtime(null)
   await new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>

/** Connects like the browser would: same-site origin, session cookie, WebSocket. */
function client(cookie?: string, origin = ORIGIN): Client {
   const socket: Client = connect(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin, ...(cookie ? { cookie } : {}) },
   })
   clients.push(socket)
   return socket
}
const connected = (s: Client) =>
   new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve())
      s.once('connect_error', reject)
   })
const rejected = (s: Client) =>
   new Promise<string>((resolve, reject) => {
      s.once('connect_error', (e) => resolve(e.message))
      s.once('connect', () => reject(new Error('should have been rejected')))
   })
const subscribe = (s: Client, householdId: unknown) =>
   new Promise<{ ok: boolean; error?: string; data?: { online: string[] } }>((resolve) =>
      s.emit('household:subscribe', householdId, resolve),
   )
const next = <E extends keyof ServerToClientEvents>(s: Client, event: E) =>
   new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => {
      s.once(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => resolve(payload)) as never)
   })
/** Resolves true if the event does NOT arrive within the window. */
const silent = (s: Client, event: keyof ServerToClientEvents, ms = 300) =>
   new Promise<boolean>((resolve) => {
      const handler = () => resolve(false)
      s.once(event, handler)
      setTimeout(() => {
         s.off(event, handler)
         resolve(true)
      }, ms)
   })

const H = { 'X-Requested-With': 'fetch' }
const api = (cookie: string) => ({
   post: (u: string, body: object = {}) => request(app).post(u).set(H).set('Cookie', cookie).send(body),
   patch: (u: string, body: object) => request(app).patch(u).set(H).set('Cookie', cookie).send(body),
   del: (u: string) => request(app).delete(u).set(H).set('Cookie', cookie),
})

async function household() {
   const owner = await signedInUser(app, 'Owner')
   const hid: string = (await api(owner.cookie).post('/api/households', { name: 'Live' })).body.id
   const member = await signedInUser(app, 'Member')
   const membership = await Membership.create({ householdId: hid, userId: member.user._id, role: 'member' })
   return { owner, member, hid, mid: membership.id as string }
}

describe('handshake', () => {
   it('rejects connections without a valid session', async () => {
      expect(await rejected(client())).toBe('Not signed in')
      expect(await rejected(client('__Host-session=forged-value'))).toBe('Not signed in')
   })

   it('rejects pages from another site even with a valid cookie', async () => {
      const { cookie } = await signedInUser(app)
      expect(await rejected(client(cookie, 'https://evil.example'))).toBe('Forbidden origin')
   })

   it('accepts a signed-in user from the app’s own origin', async () => {
      const { cookie } = await signedInUser(app)
      await connected(client(cookie))
   })
})

describe('household rooms', () => {
   it('only members can subscribe; bad ids get a safe error', async () => {
      const { member, hid } = await household()
      const stranger = await signedInUser(app, 'Stranger')
      const s = client(stranger.cookie)
      await connected(s)
      expect(await subscribe(s, hid)).toEqual({ ok: false, error: 'Household not found' })
      expect(await subscribe(s, 'not-an-id')).toEqual({ ok: false, error: 'Invalid household' })
      expect(await subscribe(s, { $ne: null })).toEqual({ ok: false, error: 'Invalid household' })

      const m = client(member.cookie)
      await connected(m)
      expect(await subscribe(m, hid)).toMatchObject({ ok: true })
   })

   it('pushes a change to other members after a successful REST write, not to strangers', async () => {
      const { owner, member, hid } = await household()
      const m = client(member.cookie)
      await connected(m)
      await subscribe(m, hid)
      const stranger = client((await signedInUser(app, 'Stranger')).cookie)
      await connected(stranger)

      const event = next(m, 'household:changed')
      const strangerSilent = silent(stranger, 'household:changed')
      await api(owner.cookie).patch(`/api/households/${hid}`, { name: 'Renamed' })
      expect(await event).toMatchObject({ householdId: hid, topics: ['household'] })
      expect(await strangerSilent).toBe(true)
   })

   it('a failed write pushes nothing', async () => {
      const { owner, member, hid } = await household()
      const o = client(owner.cookie)
      await connected(o)
      await subscribe(o, hid)
      const quiet = silent(o, 'household:changed')
      // Members can't rename: 403, so nothing may be announced.
      expect((await api(member.cookie).patch(`/api/households/${hid}`, { name: 'Nope' })).status).toBe(403)
      expect(await quiet).toBe(true)
   })

   it('a removed member is taken out of the room and told to reload', async () => {
      const { owner, member, hid, mid } = await household()
      const m = client(member.cookie)
      await connected(m)
      await subscribe(m, hid)

      const told = next(m, 'user:changed')
      await api(owner.cookie).del(`/api/households/${hid}/members/${mid}`)
      expect((await told).topics).toContain('households')

      // No more events from that household.
      const quiet = silent(m, 'household:changed')
      await api(owner.cookie).patch(`/api/households/${hid}`, { name: 'After removal' })
      expect(await quiet).toBe(true)
   })
})

describe('online presence', () => {
   const ownerMid = async (hid: string, userId: string) =>
      (await Membership.findOne({ householdId: hid, userId }))?.id as string

   it('subscribing returns who in the household is online right now', async () => {
      const { owner, member, hid, mid } = await household()
      const o = client(owner.cookie)
      await connected(o)
      expect((await subscribe(o, hid)).data?.online).toEqual([await ownerMid(hid, owner.user.id)])

      const m = client(member.cookie)
      await connected(m)
      expect((await subscribe(m, hid)).data?.online.sort()).toEqual([await ownerMid(hid, owner.user.id), mid].sort())
   })

   it('members see others come online and go offline (by membership id)', async () => {
      const { owner, member, hid, mid } = await household()
      const o = client(owner.cookie)
      await connected(o)
      await subscribe(o, hid)

      const cameOnline = next(o, 'presence:changed')
      const m = client(member.cookie)
      await connected(m)
      expect(await cameOnline).toEqual({ householdId: hid, memberId: mid, online: true })

      const wentOffline = next(o, 'presence:changed')
      m.disconnect()
      expect(await wentOffline).toEqual({ householdId: hid, memberId: mid, online: false })
   })

   it('stays online while another tab is open', async () => {
      const { owner, member, hid, mid } = await household()
      const o = client(owner.cookie)
      await connected(o)
      await subscribe(o, hid)
      const cameOnline = next(o, 'presence:changed')
      const tab1 = client(member.cookie)
      const tab2 = client(member.cookie)
      await Promise.all([connected(tab1), connected(tab2)])
      expect(await cameOnline).toMatchObject({ memberId: mid, online: true }) // announced once

      const quiet = silent(o, 'presence:changed')
      tab1.disconnect()
      expect(await quiet).toBe(true)

      const offline = next(o, 'presence:changed')
      tab2.disconnect()
      expect(await offline).toMatchObject({ memberId: mid, online: false })
   })

   it('people outside the household don’t learn anyone’s status', async () => {
      const { member, hid } = await household()
      const stranger = client((await signedInUser(app, 'Stranger')).cookie)
      await connected(stranger)
      expect(await subscribe(stranger, hid)).toEqual({ ok: false, error: 'Household not found' })
      const quiet = silent(stranger, 'presence:changed')
      await connected(client(member.cookie))
      expect(await quiet).toBe(true)
   })
})

describe('personal events', () => {
   it('an invitation by handle reaches the invitee live', async () => {
      const { owner, hid } = await household()
      const target = await signedInUser(app, 'Target')
      await api(target.cookie).patch('/api/account', { handle: 'live.target', findableByHandle: true })
      const t = client(target.cookie)
      await connected(t)
      const inbox = next(t, 'user:changed')
      await api(owner.cookie).post(`/api/households/${hid}/invitations`, { kind: 'user', userId: target.user.id })
      expect((await inbox).topics).toEqual(['invitations'])
   })
})

describe('ending sessions cuts live connections', () => {
   it('logout disconnects that session’s socket, but not other devices', async () => {
      const { cookie, user } = await signedInUser(app, 'Dev')
      const other = await request(app).post('/api/auth/login').set(H).send({ email: user.email, password: 'a perfectly fine passphrase' })
      const otherCookie = String(other.headers['set-cookie']).split(';')[0] ?? ''
      const mine = client(cookie)
      const theirs = client(otherCookie)
      await Promise.all([connected(mine), connected(theirs)])

      const cut = new Promise<string>((resolve) => mine.once('disconnect', resolve))
      await api(cookie).post('/api/auth/logout')
      expect(await cut).toBe('io server disconnect')
      expect(theirs.connected).toBe(true)
   })

   it('“sign out everywhere else” disconnects the other devices only', async () => {
      const { cookie, user } = await signedInUser(app, 'Dev')
      const other = await request(app).post('/api/auth/login').set(H).send({ email: user.email, password: 'a perfectly fine passphrase' })
      const otherCookie = String(other.headers['set-cookie']).split(';')[0] ?? ''
      const mine = client(cookie)
      const theirs = client(otherCookie)
      await Promise.all([connected(mine), connected(theirs)])

      const cut = new Promise<string>((resolve) => theirs.once('disconnect', resolve))
      await request(app).delete('/api/auth/sessions').set(H).set('Cookie', cookie)
      expect(await cut).toBe('io server disconnect')
      expect(mine.connected).toBe(true)
   })
})
