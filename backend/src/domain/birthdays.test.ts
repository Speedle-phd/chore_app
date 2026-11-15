import { describe, expect, it } from 'vitest'
import { birthdaysBetween, normalizeBirthday, parseBirthday } from './birthdays'

describe('parseBirthday / normalizeBirthday', () => {
   it.each([
      ['1990-05-12', '1990-05-12'],
      ['--05-12', '--05-12'],
      ['--02-29', '--02-29'],
      ['2000-02-29', '2000-02-29'],
      ['1999-02-29', null],
      ['1990-13-01', null],
      ['12.05.1990', null],
      ['2030-01-01', null],
      ['1850-01-01', null],
   ])('%s → %s', (value, expected) => {
      expect(normalizeBirthday(value, '2026-11-16')).toBe(expected)
   })

   it('keeps an unknown year as null', () => {
      expect(parseBirthday('--12-24')).toEqual({ month: 12, day: 24, year: null })
   })
})

describe('birthdaysBetween', () => {
   it('lists the date and age in the range (end exclusive)', () => {
      expect(birthdaysBetween({ month: 5, day: 12, year: 1990 }, '2026-05-01', '2026-06-01')).toEqual([
         { date: '2026-05-12', age: 36 },
      ])
      expect(birthdaysBetween({ month: 5, day: 12, year: 1990 }, '2026-05-13', '2027-05-12')).toEqual([])
   })

   it('spans a new year', () => {
      expect(birthdaysBetween({ month: 1, day: 2, year: null }, '2026-12-20', '2027-01-10')).toEqual([
         { date: '2027-01-02', age: null },
      ])
   })

   it('shows 29 February on the 28th in non-leap years', () => {
      const leapling = { month: 2, day: 29, year: 2000 }
      expect(birthdaysBetween(leapling, '2027-02-01', '2027-03-01')).toEqual([{ date: '2027-02-28', age: 27 }])
      expect(birthdaysBetween(leapling, '2028-02-01', '2028-03-01')).toEqual([{ date: '2028-02-29', age: 28 }])
   })

   it('nothing before the person was born', () => {
      expect(birthdaysBetween({ month: 3, day: 1, year: 2026 }, '2025-01-01', '2027-01-01')).toEqual([
         { date: '2026-03-01', age: 0 },
      ])
   })
})
