import { describe, expect, it } from 'vitest'
import { emptyGuestContent, guestPageSections, hasContent, isExpired, ssidTooLong, wifiPasswordProblem, type GuestContent } from './guest'

const full = (): GuestContent => ({
   wifi: { network: 'Home', password: 'secret123', security: 'WPA', hidden: false },
   emergency: { address: 'Hauptstr. 1, Berlin', numbers: [{ label: 'Police', number: '110' }], pharmacy: '' },
   contacts: [{ name: 'Oma', relation: 'Grandma', phone: '+49 30 123', note: '' }],
   people: [{ name: 'Mia', bedtime: '19:30', meals: '', rules: '' }],
   notes: [{ title: 'Fuse box', text: 'Cellar, left' }],
})

describe('guest content', () => {
   it('starts with Germany’s emergency numbers 112 and 110 and nothing else', () => {
      const c = emptyGuestContent()
      expect(c.emergency.numbers.map((n) => n.number)).toEqual(['112', '110'])
      expect(c.wifi).toBeNull()
      expect([c.contacts, c.people, c.notes]).toEqual([[], [], []])
   })

   it('a section counts as filled only with something in it', () => {
      const c = emptyGuestContent()
      expect(hasContent(c, 'wifi')).toBe(false)
      expect(hasContent(c, 'emergency')).toBe(true) // the prefilled numbers
      expect(hasContent({ ...c, emergency: { address: '', numbers: [], pharmacy: '' } }, 'emergency')).toBe(false)
      expect(hasContent({ ...c, wifi: { network: '', password: '', security: 'nopass', hidden: false } }, 'wifi')).toBe(false)
      expect(hasContent(full(), 'notes')).toBe(true)
   })

   it('a link shows only its own sections that have content', () => {
      const c = { ...full(), people: [] }
      expect(Object.keys(guestPageSections(c, ['notes', 'wifi', 'people']))).toEqual(['wifi', 'notes'])
      expect(guestPageSections(c, ['contacts'])).toEqual({ contacts: c.contacts })
      expect(guestPageSections(c, [])).toEqual({})
   })
})

describe('expiry', () => {
   const now = new Date('2026-11-18T12:00:00Z')
   it.each([
      [null, false],
      [new Date('2026-11-18T12:00:01Z'), false],
      [new Date('2026-11-18T12:00:00Z'), true],
      [new Date('2026-11-01T00:00:00Z'), true],
   ])('expiresAt %s → expired %s', (at, expired) => {
      expect(isExpired(at, now)).toBe(expired)
   })
})

describe('Wi-Fi checks', () => {
   it.each([
      ['WPA', '1234567', 'A WPA password has 8 to 63 characters.'],
      ['WPA', '12345678', null],
      ['WPA', 'x'.repeat(63), null],
      ['WPA', 'x'.repeat(64), 'A WPA password has 8 to 63 characters.'],
      ['WPA', 'a'.repeat(64), null], // 64 hex digits = raw key
      ['WPA', '', 'Enter the Wi-Fi password.'],
      ['WEP', 'abcde', null],
      ['nopass', '', null],
      ['nopass', 'x', 'An open network has no password.'],
   ] as const)('%s %j → %s', (security, password, problem) => {
      expect(wifiPasswordProblem(security, password)).toBe(problem)
   })

   it('network names are limited to 32 bytes, not characters', () => {
      expect(ssidTooLong('x'.repeat(32))).toBe(false)
      expect(ssidTooLong('x'.repeat(33))).toBe(true)
      expect(ssidTooLong('ü'.repeat(16))).toBe(false) // 2 bytes each
      expect(ssidTooLong('ü'.repeat(17))).toBe(true)
   })
})
