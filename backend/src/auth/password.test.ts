import { describe, expect, it, vi } from 'vitest'
import {
   hashPassword,
   needsRehash,
   passwordContext,
   passwordProblems,
   verifyPassword,
} from './password'

const notBreached = async () => false
const context = passwordContext({ email: 'ann.example@mail.test', fname: 'Annabel', lname: 'Smith' })

describe('passwordProblems (NIST SP 800-63B-4)', () => {
   it('rejects 14 characters and accepts 15', async () => {
      expect(await passwordProblems('a'.repeat(14), [], notBreached)).toEqual([
         'Use at least 15 characters.',
      ])
      expect(await passwordProblems('a'.repeat(15), [], notBreached)).toEqual([])
   })

   it('counts characters, not UTF-16 units (emoji, umlauts, spaces allowed)', async () => {
      // 15 code points but 20 UTF-16 units: .length would give the wrong answer.
      const fifteen = 'ä ö ü 🙂🙂🙂🙂🙂 ßßß'
      expect([...fifteen].length).toBe(15)
      expect(await passwordProblems(fifteen, [], notBreached)).toEqual([])
   })

   it('allows long passphrases (64+) and rejects over 128', async () => {
      expect(await passwordProblems('x'.repeat(100), [], notBreached)).toEqual([])
      expect(await passwordProblems('x'.repeat(129), [], notBreached)).toEqual([
         'Use at most 128 characters.',
      ])
   })

   it('has no composition rules', async () => {
      expect(await passwordProblems('just lowercase words here', [], notBreached)).toEqual([])
   })

   it.each(['my hearth password', 'annabel is great!!', 'ANN.EXAMPLE rocks hard', 'smithsmithsmith1'])(
      'rejects context words: %s',
      async (password) => {
         expect(await passwordProblems(password, context, notBreached)).toContain(
            'Don’t use your name, email or the app name.',
         )
      },
   )

   it('rejects breached passwords and only checks when otherwise valid', async () => {
      const breached = vi.fn(async () => true)
      expect(await passwordProblems('correct horse battery', [], breached)).toEqual([
         'This password appeared in a data breach. Please choose another one.',
      ])
      breached.mockClear()
      await passwordProblems('short', [], breached)
      expect(breached).not.toHaveBeenCalled()
   })
})

describe('hashing', () => {
   it('uses Argon2id with the OWASP parameters and verifies', async () => {
      const hash = await hashPassword('a long enough passphrase')
      expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true)
      expect(needsRehash(hash)).toBe(false)
      expect(await verifyPassword(hash, 'a long enough passphrase')).toBe(true)
      expect(await verifyPassword(hash, 'a long enough passphrasE')).toBe(false)
   })

   it('flags hashes with outdated parameters for rehash', () => {
      expect(needsRehash('$argon2id$v=19$m=4096,t=3,p=1$abc$def')).toBe(true)
   })
})
