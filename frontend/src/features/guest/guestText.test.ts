import { describe, expect, it } from 'vitest'
import { endOfDay, filledSections, localDate, readableProblem, telHref, wifiQrText } from './guestText'

describe('wifiQrText', () => {
   it('WPA network (example from the ZXing format description)', () => {
      expect(wifiQrText({ network: 'mynetwork', password: 'mypass', security: 'WPA', hidden: false })).toBe('WIFI:T:WPA;S:mynetwork;P:mypass;;')
   })

   it('escapes \\ ; , : and " in name and password', () => {
      expect(wifiQrText({ network: 'Home;5G', password: 'a\\b,c:d"e', security: 'WPA', hidden: false })).toBe(
         'WIFI:T:WPA;S:Home\\;5G;P:a\\\\b\\,c\\:d\\"e;;',
      )
   })

   it('open network: no password; hidden network: H:true', () => {
      expect(wifiQrText({ network: 'Cafe', password: '', security: 'nopass', hidden: false })).toBe('WIFI:T:nopass;S:Cafe;;')
      expect(wifiQrText({ network: 'Secret', password: 'longenough', security: 'WEP', hidden: true })).toBe('WIFI:T:WEP;S:Secret;P:longenough;H:true;;')
   })

   it('keeps umlauts and emojis as they are', () => {
      expect(wifiQrText({ network: 'Müller 🏠', password: 'grüße123', security: 'WPA', hidden: false })).toBe('WIFI:T:WPA;S:Müller 🏠;P:grüße123;;')
   })
})

describe('telHref', () => {
   it.each([
      ['112', 'tel:112'],
      ['+49 30 1234567', 'tel:+49301234567'],
      ['+49 (0)30 123-45 67', 'tel:+49301234567'],
      ['030 / 123 45', 'tel:03012345'],
   ])('%s → %s', (phone, href) => {
      expect(telHref(phone)).toBe(href)
   })
})

describe('expiry dates', () => {
   it('a chosen day lasts until its local end, and comes back as the same day', () => {
      const iso = endOfDay('2026-11-20')
      expect(new Date(iso).getHours()).toBe(23)
      expect(localDate(iso)).toBe('2026-11-20')
   })
})

describe('readableProblem', () => {
   it.each([
      ['contacts.0.phone: Phone: only digits, spaces, + ( ) / . - please.', 'Contact 1: Phone: only digits, spaces, + ( ) / . - please.'],
      ['emergency.numbers.2.label: Label is missing.', 'Emergency number 3: Label is missing.'],
      ['wifi.password: A WPA password has 8 to 63 characters.', 'Wi-Fi: A WPA password has 8 to 63 characters.'],
      ['notes: At most 30 notes.', 'House note: At most 30 notes.'],
      ['Pick at least one section.', 'Pick at least one section.'],
   ])('%s', (detail, readable) => {
      expect(readableProblem(detail)).toBe(readable)
   })
})

describe('filledSections', () => {
   const content = {
      wifi: { network: '', password: '', security: 'WPA' as const, hidden: false },
      emergency: { address: '', numbers: [{ label: 'Police', number: '110' }], pharmacy: '' },
      contacts: [],
      people: [{ name: 'Mia', bedtime: '', meals: '', rules: '' }],
      notes: [],
   }
   it('leaves out empty sections (a Wi-Fi without a name counts as empty)', () => {
      expect(Object.keys(filledSections(content))).toEqual(['emergency', 'people'])
   })
   it('and sections the link doesn’t show', () => {
      expect(Object.keys(filledSections(content, ['people', 'wifi']))).toEqual(['people'])
   })
})
