import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { loadEnv } from './config/env'

const env = loadEnv({
   NODE_ENV: 'test',
   MONGODB_URI: 'mongodb://unused-in-these-tests',
   MAILER_KEY: 'x'.repeat(32),
})
const app = createApp(env)

// An unknown /api route: passing the CSRF check means reaching the 404 handler.
const MUTATION_PATH = '/api/__does-not-exist'

describe('CSRF protection', () => {
   it('blocks a mutation without the custom header', async () => {
      const res = await request(app).post(MUTATION_PATH).send({})
      expect(res.status).toBe(403)
      expect(res.body.message).toBe('Missing request header')
   })

   it('blocks a cross-site mutation even with the header', async () => {
      const res = await request(app)
         .post(MUTATION_PATH)
         .set('X-Requested-With', 'fetch')
         .set('Sec-Fetch-Site', 'cross-site')
         .send({})
      expect(res.status).toBe(403)
      expect(res.body.message).toBe('Cross-site request blocked')
   })

   it('blocks a same-site (sibling subdomain) mutation', async () => {
      const res = await request(app)
         .delete(MUTATION_PATH)
         .set('X-Requested-With', 'fetch')
         .set('Sec-Fetch-Site', 'same-site')
      expect(res.status).toBe(403)
   })

   it.each(['same-origin', 'none', undefined])(
      'lets a mutation with the header through (Sec-Fetch-Site: %s)',
      async (site) => {
         const req = request(app)
            .put(MUTATION_PATH)
            .set('X-Requested-With', 'fetch')
         if (site) req.set('Sec-Fetch-Site', site)
         const res = await req.send({})
         expect(res.status).toBe(404)
      },
   )

   it('does not require the header for safe methods', async () => {
      const res = await request(app).get(MUTATION_PATH)
      expect(res.status).toBe(404)
   })
})

describe('health check', () => {
   it('is reachable and reports 503 while the database is not connected', async () => {
      const res = await request(app).get('/api/health')
      expect(res.status).toBe(503)
      expect(res.body.database).toBe('disconnected')
   })
})

describe('security headers and CORS', () => {
   it('sets helmet headers', async () => {
      const res = await request(app).get('/api/health')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['content-security-policy']).toBeDefined()
   })

   it('allows PUT from the app origin in a preflight', async () => {
      const res = await request(app)
         .options('/api/members/1')
         .set('Origin', 'http://localhost:5173')
         .set('Access-Control-Request-Method', 'PUT')
      expect(res.headers['access-control-allow-origin']).toBe(
         'http://localhost:5173',
      )
      expect(res.headers['access-control-allow-methods']).toContain('PUT')
   })

   it('does not allow other origins', async () => {
      const res = await request(app)
         .options('/api/members/1')
         .set('Origin', 'https://evil.example')
         .set('Access-Control-Request-Method', 'DELETE')
      expect(res.headers['access-control-allow-origin']).not.toBe(
         'https://evil.example',
      )
   })
})
