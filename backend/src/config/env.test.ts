import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

const valid = {
   MONGODB_URI: 'mongodb://mongo:27017/chores',
   MAILER_KEY: 'k'.repeat(32),
}

describe('loadEnv', () => {
   it('applies defaults for optional settings', () => {
      const env = loadEnv(valid)
      expect(env.PORT).toBe(3000)
      expect(env.NODE_ENV).toBe('development')
      expect(env.APP_URL).toBe('http://localhost:5173')
      expect(env.MAILER_URL).toBe('http://mailer:8000')
   })

   it('coerces PORT from a string', () => {
      expect(loadEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000)
   })

   it('fails with every problem listed when required values are missing', () => {
      expect(() => loadEnv({})).toThrowError(/MONGODB_URI[\s\S]*MAILER_KEY/)
   })

   it('rejects a short mailer secret (no weak secrets, no default)', () => {
      expect(() => loadEnv({ ...valid, MAILER_KEY: 'short' })).toThrowError(
         /MAILER_KEY must be at least 32 characters/,
      )
   })

   it.each([
      [undefined, false],
      ['false', false],
      ['1', 1],
      ['loopback', 'loopback'],
   ])('parses TRUST_PROXY=%s as %s', (value, expected) => {
      expect(loadEnv({ ...valid, ...(value === undefined ? {} : { TRUST_PROXY: value }) }).TRUST_PROXY).toBe(expected)
   })

   it('rejects an invalid APP_URL', () => {
      expect(() => loadEnv({ ...valid, APP_URL: 'not a url' })).toThrowError(
         /APP_URL/,
      )
   })
})
