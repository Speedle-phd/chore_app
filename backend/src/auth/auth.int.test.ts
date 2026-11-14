import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { loadEnv } from '../config/env'
import type { MailTemplate } from '../mail/mailer'
import { ActionToken } from '../models/actionTokenModel'
import { AuditLog } from '../models/auditLogModel'
import { LoginThrottle } from '../models/loginThrottleModel'
import { Session } from '../models/sessionModel'
import { User } from '../models/userModel'
import { useTestDatabase } from '../test/db'

useTestDatabase()

type Sent = { template: MailTemplate; to: string; data: Record<string, unknown> }
const outbox: Sent[] = []
const BREACHED = 'correct horse battery staple'

const env = loadEnv({
   NODE_ENV: 'test',
   MONGODB_URI: 'set-by-useTestDatabase',
   MAILER_KEY: 'k'.repeat(32),
   APP_URL: 'http://localhost:5173',
})
const deps = {
   sendMail: async (template: MailTemplate, to: string, data: Record<string, unknown>) => {
      outbox.push({ template, to, data })
   },
   isBreached: async (password: string) => password === BREACHED,
   rateLimits: { login: 1000, email: 1000, token: 1000, search: 1000 },
}
const app = createApp(env, deps)

const PASSWORD = 'a perfectly fine passphrase'
const json = { 'X-Requested-With': 'fetch' }

const post = (path: string, body: object, cookie?: string) => {
   const req = request(app).post(path).set(json)
   if (cookie) req.set('Cookie', cookie)
   return req.send(body)
}
const me = (cookie?: string) => {
   const req = request(app).get('/api/auth/me')
   if (cookie) req.set('Cookie', cookie)
   return req
}

/** Secure cookies aren't replayed over http by supertest's jar, so handle them by hand. */
function sessionCookie(res: request.Response): { header: string; raw: string } {
   const raw = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('__Host-session='))
   if (!raw) throw new Error('No session cookie set')
   return { header: raw.split(';')[0] ?? '', raw }
}

const lastMail = (template: MailTemplate) => {
   const mail = outbox.filter((m) => m.template === template).at(-1)
   if (!mail) throw new Error(`No ${template} email sent`)
   return mail
}
const tokenFrom = (mail: Sent, key = 'link') =>
   new URL(String(mail.data[key])).searchParams.get('token') ?? ''

let n = 0
async function signupAndVerify(overrides: Partial<{ email: string; password: string }> = {}) {
   const email = overrides.email ?? `user${++n}@example.test`
   const password = overrides.password ?? PASSWORD
   await post('/api/auth/signup', { fname: 'Test', lname: 'User', email, password }).expect(202)
   const res = await post('/api/auth/verify-email', { token: tokenFrom(lastMail('verify_email')) }).expect(200)
   return { email, password, cookie: sessionCookie(res).header }
}

beforeEach(async () => {
   outbox.length = 0
   await LoginThrottle.deleteMany({})
})

describe('signup', () => {
   it('creates an unverified user with an Argon2id hash and emails a verification link', async () => {
      const res = await post('/api/auth/signup', {
         fname: 'Ann',
         lname: 'Lee',
         email: '  Ann.Lee@Example.TEST ',
         password: PASSWORD,
      })
      expect(res.status).toBe(202)

      const user = await User.findOne({ email: 'ann.lee@example.test' }).lean()
      expect(user?.emailVerifiedAt).toBeNull()
      expect(user?.passwordHash.startsWith('$argon2id$')).toBe(true)
      expect(JSON.stringify(user)).not.toContain(PASSWORD)

      const mail = lastMail('verify_email')
      expect(mail.to).toBe('ann.lee@example.test')
      expect(String(mail.data.link)).toMatch(/^http:\/\/localhost:5173\/verify-email\?token=/)
      // Only the token's hash is stored.
      const token = tokenFrom(mail)
      expect(await ActionToken.exists({ tokenHash: token })).toBeNull()
   })

   it('answers identically for an existing account and emails that person instead', async () => {
      const { email } = await signupAndVerify()
      outbox.length = 0
      const fresh = await post('/api/auth/signup', { fname: 'A', lname: 'B', email: 'brand.new@example.test', password: PASSWORD })
      const existing = await post('/api/auth/signup', { fname: 'A', lname: 'B', email, password: PASSWORD })
      expect(existing.status).toBe(fresh.status)
      expect(existing.body).toEqual(fresh.body)
      expect(lastMail('account_exists').to).toBe(email)
      expect(await User.countDocuments({ email })).toBe(1)
   })

   it.each([
      ['14 characters', 'a'.repeat(14), 'Use at least 15 characters.'],
      ['a breached password', BREACHED, 'This password appeared in a data breach. Please choose another one.'],
      ['the person’s name', 'my name is Rosalind!!', 'Don’t use your name, email or the app name.'],
   ])('rejects %s with the reasons listed', async (_label, password, reason) => {
      const res = await post('/api/auth/signup', { fname: 'Rosalind', lname: 'Q', email: `weak${++n}@example.test`, password })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('WEAK_PASSWORD')
      expect(res.body.details).toContain(reason)
   })

   it('rejects a weak password the same way for an existing email (no enumeration)', async () => {
      const { email } = await signupAndVerify()
      const res = await post('/api/auth/signup', { fname: 'X', lname: 'Y', email, password: 'short' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('WEAK_PASSWORD')
   })

   it('validates input and returns 400 with details', async () => {
      const res = await post('/api/auth/signup', { fname: '', email: 'nope', password: PASSWORD })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
      expect(res.body.details.join(' ')).toMatch(/email/)
   })
})

describe('email verification', () => {
   it('signs the user in with a hardened cookie and works only once', async () => {
      await post('/api/auth/signup', { fname: 'Ver', lname: 'Ify', email: 'verify@example.test', password: PASSWORD })
      const token = tokenFrom(lastMail('verify_email'))

      const res = await post('/api/auth/verify-email', { token })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ email: 'verify@example.test', emailVerified: true })
      const { raw, header } = sessionCookie(res)
      expect(raw).toMatch(/HttpOnly/i)
      expect(raw).toMatch(/Secure/i)
      expect(raw).toMatch(/SameSite=Lax/i)
      expect(raw).toMatch(/Path=\//)
      expect(raw).not.toMatch(/Domain=/i)

      expect((await me(header)).body.email).toBe('verify@example.test')
      // The raw session id is never stored, only its hash.
      expect(await Session.exists({ idHash: header.split('=')[1] ?? '' })).toBeNull()

      const again = await post('/api/auth/verify-email', { token })
      expect(again.status).toBe(400)
      expect(again.body.code).toBe('INVALID_TOKEN')
   })

   it('rejects an expired token', async () => {
      await post('/api/auth/signup', { fname: 'Ex', lname: 'Pired', email: 'expired@example.test', password: PASSWORD })
      const token = tokenFrom(lastMail('verify_email'))
      await ActionToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
      const res = await post('/api/auth/verify-email', { token })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_TOKEN')
   })
})

describe('login', () => {
   it('refuses an unverified account only after a correct password', async () => {
      await post('/api/auth/signup', { fname: 'Un', lname: 'Verified', email: 'unverified@example.test', password: PASSWORD })
      const wrong = await post('/api/auth/login', { email: 'unverified@example.test', password: 'wrong password here' })
      expect(wrong.status).toBe(401)
      const right = await post('/api/auth/login', { email: 'unverified@example.test', password: PASSWORD })
      expect(right.status).toBe(403)
      expect(right.body.code).toBe('EMAIL_NOT_VERIFIED')
   })

   it('gives the same answer for an unknown email and a wrong password', async () => {
      const { email } = await signupAndVerify()
      const unknown = await post('/api/auth/login', { email: 'nobody@example.test', password: PASSWORD })
      const wrong = await post('/api/auth/login', { email, password: 'not the password!!' })
      expect(unknown.status).toBe(401)
      expect(wrong.status).toBe(401)
      expect(unknown.body).toEqual(wrong.body)
      expect(unknown.headers['set-cookie']).toBeUndefined()
   })

   it('issues a new session id on every login', async () => {
      const { email, cookie: first } = await signupAndVerify()
      const res = await post('/api/auth/login', { email, password: PASSWORD }).expect(200)
      const second = sessionCookie(res).header
      expect(second).not.toBe(first)
      expect((await me(first)).status).toBe(200) // other devices stay signed in
      expect((await me(second)).status).toBe(200)
   })

   it.each(['existing', 'unknown'])('throttles an %s account after 5 failures, even with the right password', async (kind) => {
      const email = kind === 'existing' ? (await signupAndVerify()).email : `ghost${++n}@example.test`
      for (let i = 0; i < 5; i++) {
         expect((await post('/api/auth/login', { email, password: 'wrong wrong wrong' })).status).toBe(401)
      }
      const locked = await post('/api/auth/login', { email, password: PASSWORD })
      expect(locked.status).toBe(429)
      expect(locked.body.code).toBe('RATE_LIMITED')
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0)
   })

   it('limits login attempts per IP', async () => {
      const limited = createApp(env, { ...deps, rateLimits: { login: 2, email: 1000, token: 1000, search: 1000 } })
      const attempt = () =>
         request(limited).post('/api/auth/login').set(json).send({ email: `ip${++n}@example.test`, password: PASSWORD })
      expect((await attempt()).status).toBe(401)
      expect((await attempt()).status).toBe(401)
      expect((await attempt()).status).toBe(429)
   })

   it('requires the CSRF header', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'a@b.test', password: PASSWORD })
      expect(res.status).toBe(403)
   })
})

describe('sessions', () => {
   it('logout invalidates the session server-side', async () => {
      const { cookie } = await signupAndVerify()
      const res = await post('/api/auth/logout', {}, cookie)
      expect(res.status).toBe(204)
      expect(String(res.headers['set-cookie'])).toMatch(/__Host-session=;/)
      expect((await me(cookie)).status).toBe(401) // replaying the old cookie fails
   })

   it('expires a session after the idle timeout', async () => {
      const { cookie } = await signupAndVerify()
      await Session.updateMany({}, { $set: { lastSeenAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) } })
      expect((await me(cookie)).status).toBe(401)
   })

   it('protects household routes', async () => {
      expect((await request(app).get('/api/households')).status).toBe(401)
      const { cookie } = await signupAndVerify()
      expect((await request(app).get('/api/households').set('Cookie', cookie)).status).toBe(200)
   })
})

describe('password reset', () => {
   it('answers identically for unknown and known emails', async () => {
      const { email } = await signupAndVerify()
      outbox.length = 0
      const known = await post('/api/auth/password/forgot', { email })
      const unknown = await post('/api/auth/password/forgot', { email: 'nobody@example.test' })
      expect(known.status).toBe(202)
      expect(unknown.body).toEqual(known.body)
      expect(outbox.map((m) => m.template)).toEqual(['reset_password'])
   })

   it('works once, signs out every other session and notifies the user', async () => {
      const { email, cookie: oldSession } = await signupAndVerify()
      await post('/api/auth/password/forgot', { email }).expect(202)
      const token = tokenFrom(lastMail('reset_password'))
      const newPassword = 'a brand new passphrase'

      const weak = await post('/api/auth/password/reset', { token, password: 'short' })
      expect(weak.body.code).toBe('WEAK_PASSWORD') // token not used up by a weak attempt

      const res = await post('/api/auth/password/reset', { token, password: newPassword })
      expect(res.status).toBe(200)
      expect((await me(oldSession)).status).toBe(401)
      expect((await me(sessionCookie(res).header)).status).toBe(200)
      expect(lastMail('password_changed').to).toBe(email)

      expect((await post('/api/auth/password/reset', { token, password: newPassword })).body.code).toBe('INVALID_TOKEN')
      expect((await post('/api/auth/login', { email, password: PASSWORD })).status).toBe(401)
      expect((await post('/api/auth/login', { email, password: newPassword })).status).toBe(200)
   })

   it('rejects an expired reset token', async () => {
      const { email } = await signupAndVerify()
      await post('/api/auth/password/forgot', { email })
      const token = tokenFrom(lastMail('reset_password'))
      await ActionToken.updateMany({ purpose: 'reset_password' }, { $set: { expiresAt: new Date(Date.now() - 1) } })
      expect((await post('/api/auth/password/reset', { token, password: 'another fine passphrase' })).status).toBe(400)
   })
})

describe('change password', () => {
   it('needs the current password, keeps this session and ends the others', async () => {
      const { email, cookie: current } = await signupAndVerify()
      const other = sessionCookie(await post('/api/auth/login', { email, password: PASSWORD })).header

      const wrong = await post('/api/auth/password/change', { currentPassword: 'not it at all!', newPassword: 'whatever passphrase 1' }, current)
      expect(wrong.status).toBe(400)
      expect(wrong.body.code).toBe('WRONG_PASSWORD')

      const res = await post('/api/auth/password/change', { currentPassword: PASSWORD, newPassword: 'changed passphrase ok' }, current)
      expect(res.status).toBe(200)
      expect((await me(current)).status).toBe(200)
      expect((await me(other)).status).toBe(401)
      expect(lastMail('password_changed').to).toBe(email)
   })

   it('requires a session', async () => {
      const res = await post('/api/auth/password/change', { currentPassword: PASSWORD, newPassword: PASSWORD })
      expect(res.status).toBe(401)
   })
})

describe('audit log', () => {
   it('records security events without secrets', async () => {
      const { email, cookie } = await signupAndVerify()
      await post('/api/auth/login', { email, password: 'wrong wrong wrong' })
      await post('/api/auth/logout', {}, cookie)
      const events = (await AuditLog.find().lean()).map((e) => e.event)
      expect(events).toEqual(expect.arrayContaining(['signup', 'email_verified', 'login_failure', 'logout']))
      const keys = new Set((await AuditLog.find().lean()).flatMap((e) => Object.keys(e)))
      expect([...keys].sort()).toEqual(['__v', '_id', 'at', 'event', 'ip', 'userAgent', 'userId'])
   })
})
