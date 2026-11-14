import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import type { MailTemplate } from '../mail/mailer'
import { Passkey } from '../models/passkeyModel'
import { WebAuthnChallenge } from '../models/webauthnChallengeModel'
import { softAuthenticator, strangerKey } from '../test/softAuthenticator'
import { useTestDatabase } from '../test/db'
import { signedInUser, TEST_PASSWORD } from '../test/users'

useTestDatabase()

const ORIGIN = 'http://localhost:5173'
const outbox: { template: MailTemplate; to: string; data: Record<string, unknown> }[] = []
const app = createApp(
   loadEnv({ NODE_ENV: 'test', MONGODB_URI: 'x', MAILER_KEY: 'k'.repeat(32), APP_URL: ORIGIN }),
   {
      sendMail: async (template, to, data) => {
         outbox.push({ template, to, data })
      },
      isBreached: async () => false,
      rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
   },
)
beforeEach(() => {
   outbox.length = 0
})

const H = { 'X-Requested-With': 'fetch' }
const post = (url: string, body: object, cookie?: string) => {
   const r = request(app).post(url).set(H)
   if (cookie) r.set('Cookie', cookie)
   return r.send(body)
}
const sessionCookie = (res: request.Response) =>
   ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('__Host-session='))?.split(';')[0]

/** Signed-in user with a registered software passkey. */
async function userWithPasskey(name = 'Laptop') {
   const person = await signedInUser(app, 'Pat')
   const device = softAuthenticator({ rpID: 'localhost', origin: ORIGIN })
   const { body } = await post('/api/auth/passkeys/register/options', {}, person.cookie)
   const res = await post(
      '/api/auth/passkeys/register',
      { challengeId: body.challengeId, response: device.register(body.options), name },
      person.cookie,
   )
   expect(res.status).toBe(201)
   return { ...person, device, passkey: res.body }
}
async function loginWith(assertion: (options: { challenge: string }) => object) {
   const { body } = await post('/api/auth/passkeys/login/options', {})
   return post('/api/auth/passkeys/login', { challengeId: body.challengeId, response: assertion(body.options) })
}

describe('registering a passkey', () => {
   it('needs a session', async () => {
      expect((await post('/api/auth/passkeys/register/options', {})).status).toBe(401)
   })

   it('offers options for this site and account, excluding passkeys already registered', async () => {
      const { cookie, user, device } = await userWithPasskey()
      const { body } = await post('/api/auth/passkeys/register/options', {}, cookie)
      expect(body.options.rp).toEqual({ name: 'Hearth', id: 'localhost' })
      expect(body.options.user.name).toBe(user.email)
      expect(body.options.authenticatorSelection.residentKey).toBe('preferred')
      expect(body.options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([device.id])
   })

   it('stores only the public key, lists it and emails the owner', async () => {
      const { cookie, user, passkey, device } = await userWithPasskey('My phone')
      expect(passkey).toMatchObject({ name: 'My phone', deviceType: 'singleDevice', lastUsedAt: null })
      const stored = await Passkey.findOne({ userId: user._id })
      expect(stored?.credentialId).toBe(device.id)
      expect(stored?.publicKey.length).toBeGreaterThan(60) // COSE public key, no private material
      const list = await request(app).get('/api/auth/passkeys').set('Cookie', cookie)
      expect(list.body).toEqual([expect.objectContaining({ id: passkey.id, name: 'My phone' })])
      expect(outbox.at(-1)).toMatchObject({ template: 'passkey_added', to: user.email, data: { passkey: 'My phone' } })
   })

   it('rejects a reused challenge and a response from another website', async () => {
      const { cookie } = await signedInUser(app, 'Ren')
      const device = softAuthenticator({ rpID: 'localhost', origin: ORIGIN })
      const { body } = await post('/api/auth/passkeys/register/options', {}, cookie)
      const phishing = await post(
         '/api/auth/passkeys/register',
         { challengeId: body.challengeId, response: device.register(body.options, { origin: 'https://evil.example' }) },
         cookie,
      )
      expect(phishing.status).toBe(400)
      expect(phishing.body.code).toBe('PASSKEY_INVALID')
      // The challenge was used up by the failed attempt.
      const replay = await post('/api/auth/passkeys/register', { challengeId: body.challengeId, response: device.register(body.options) }, cookie)
      expect(replay.body.code).toBe('CHALLENGE_EXPIRED')
      expect(await Passkey.countDocuments({})).toBeGreaterThanOrEqual(0)
   })

   it('won’t use another user’s registration challenge', async () => {
      const a = await signedInUser(app, 'Ann')
      const b = await signedInUser(app, 'Bob')
      const device = softAuthenticator({ rpID: 'localhost', origin: ORIGIN })
      const { body } = await post('/api/auth/passkeys/register/options', {}, a.cookie)
      const res = await post('/api/auth/passkeys/register', { challengeId: body.challengeId, response: device.register(body.options) }, b.cookie)
      expect(res.body.code).toBe('CHALLENGE_EXPIRED')
   })
})

describe('signing in with a passkey', () => {
   it('signs in without email or password, with a fresh hardened session', async () => {
      const { user, device, passkey } = await userWithPasskey()
      const res = await loginWith((o) => device.assert(o))
      expect(res.status).toBe(200)
      expect(res.body.email).toBe(user.email)
      const raw = String(res.headers['set-cookie'])
      expect(raw).toMatch(/__Host-session=.*HttpOnly.*Secure.*SameSite=Lax/i)
      const me = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(res) ?? '')
      expect(me.body.email).toBe(user.email)
      const stored = await Passkey.findById(passkey.id).lean()
      expect(stored?.counter).toBe(1)
      expect(stored?.lastUsedAt).not.toBeNull()
   })

   it('refuses a forged signature, an unknown passkey and a replayed challenge with the same answer', async () => {
      const { device } = await userWithPasskey()
      const forged = await loginWith((o) => device.assert(o, { signWith: strangerKey() }))
      const unknown = await loginWith((o) => softAuthenticator({ rpID: 'localhost', origin: ORIGIN }).assert(o))
      expect(forged.status).toBe(401)
      expect(unknown.status).toBe(401)
      expect(forged.body).toEqual(unknown.body)
      expect(forged.headers['set-cookie']).toBeUndefined()

      const { body } = await post('/api/auth/passkeys/login/options', {})
      expect((await post('/api/auth/passkeys/login', { challengeId: body.challengeId, response: device.assert(body.options) })).status).toBe(200)
      expect((await post('/api/auth/passkeys/login', { challengeId: body.challengeId, response: device.assert(body.options) })).status).toBe(401)
   })

   it('detects a cloned authenticator (signature counter going backwards)', async () => {
      const { device } = await userWithPasskey()
      expect((await loginWith((o) => device.assert(o, { counter: 5 }))).status).toBe(200)
      expect((await loginWith((o) => device.assert(o, { counter: 3 }))).status).toBe(401)
   })

   it('refuses an assertion claiming a different account', async () => {
      const { device } = await userWithPasskey()
      const other = await signedInUser(app, 'Other')
      const res = await loginWith((o) =>
         device.assert(o, { userHandle: Buffer.from(other.user._id.id).toString('base64url') }),
      )
      expect(res.status).toBe(401)
   })

   it('expires challenges and requires the CSRF header', async () => {
      const { device } = await userWithPasskey()
      const { body } = await post('/api/auth/passkeys/login/options', {})
      await WebAuthnChallenge.updateOne({ _id: body.challengeId }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
      expect((await post('/api/auth/passkeys/login', { challengeId: body.challengeId, response: device.assert(body.options) })).status).toBe(401)
      expect((await request(app).post('/api/auth/passkeys/login/options').send({})).status).toBe(403)
   })
})

describe('managing passkeys', () => {
   it('renames and removes only my own passkeys; removal is emailed and stops sign-in', async () => {
      const { cookie, user, device, passkey } = await userWithPasskey()
      const stranger = await signedInUser(app, 'Stranger')
      const del = (c: string) => request(app).delete(`/api/auth/passkeys/${passkey.id}`).set(H).set('Cookie', c)
      const rename = (c: string, name: string) => request(app).patch(`/api/auth/passkeys/${passkey.id}`).set(H).set('Cookie', c).send({ name })

      expect((await rename(stranger.cookie, 'Mine now')).status).toBe(404)
      expect((await del(stranger.cookie)).status).toBe(404)
      expect((await rename(cookie, '  Work laptop ')).body.name).toBe('Work laptop')
      expect((await rename(cookie, '')).status).toBe(400)

      expect((await del(cookie)).status).toBe(204)
      expect(outbox.at(-1)).toMatchObject({ template: 'passkey_removed', to: user.email, data: { passkey: 'Work laptop' } })
      expect((await loginWith((o) => device.assert(o))).status).toBe(401)
   })

   it('deleting the account deletes its passkeys', async () => {
      const { cookie, user, device } = await userWithPasskey()
      expect((await post('/api/account/delete', { password: TEST_PASSWORD }, cookie)).status).toBe(204)
      expect(await Passkey.countDocuments({ userId: user._id })).toBe(0)
      expect((await loginWith((o) => device.assert(o))).status).toBe(401)
   })
})
