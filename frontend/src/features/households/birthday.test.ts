import { describe, expect, it } from 'vitest'
import { formatBirthday, fromParts, toParts } from './birthday'

describe('birthday parts', () => {
   it.each([
      [{ day: '12', month: '5', year: '1990' }, '1990-05-12'],
      [{ day: '24', month: '12', year: '' }, '--12-24'],
      [{ day: '29', month: '2', year: '' }, '--02-29'],
      [{ day: '29', month: '2', year: '2000' }, '2000-02-29'],
      [{ day: '29', month: '2', year: '1999' }, null],
      [{ day: '31', month: '4', year: '' }, null],
      [{ day: '', month: '5', year: '' }, null],
      [{ day: '', month: '', year: '' }, ''],
   ])('%j → %s', (parts, expected) => {
      expect(fromParts(parts)).toBe(expected)
   })

   it('round-trips stored values', () => {
      expect(toParts('1990-05-12')).toEqual({ day: '12', month: '5', year: '1990' })
      expect(toParts('--12-24')).toEqual({ day: '24', month: '12', year: '' })
      expect(toParts(null)).toEqual({ day: '', month: '', year: '' })
   })

   it('formats with and without a year', () => {
      expect(formatBirthday('1990-05-12', 'en-GB')).toBe('12 May 1990')
      expect(formatBirthday('--12-24', 'en-GB')).toBe('24 Dec')
      expect(formatBirthday(null)).toBeNull()
   })
})
