import type { Express } from 'express'
import request from 'supertest'
import { hashPassword } from '../auth/password'
import { User } from '../models/userModel'

export const TEST_PASSWORD = 'a perfectly fine passphrase'
let passwordHash: Promise<string> | null = null
let counter = 0

/** Creates a verified user directly in the database and signs in; returns the cookie header. */
export async function signedInUser(app: Express, fname = 'Test') {
   passwordHash ??= hashPassword(TEST_PASSWORD)
   const email = `${fname.toLowerCase()}${++counter}@example.test`
   const user = await User.create({
      email,
      fname,
      lname: 'User',
      passwordHash: await passwordHash,
      emailVerifiedAt: new Date(),
   })
   const res = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email, password: TEST_PASSWORD })
   const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('__Host-session='))
   if (!raw) throw new Error(`Login failed for test user (${res.status})`)
   return { user, cookie: raw.split(';')[0] ?? '' }
}
