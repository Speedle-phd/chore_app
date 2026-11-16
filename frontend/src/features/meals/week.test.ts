import { describe, expect, it } from 'vitest'
import { mondayOf, slotOf, weekDays, weekRange } from './week'

describe('weeks', () => {
   it.each([
      ['2026-11-15', '2026-11-09'], // Sunday → previous Monday
      ['2026-11-16', '2026-11-16'], // Monday
      ['2026-11-18', '2026-11-16'],
      ['2027-01-01', '2026-12-28'], // across the year
   ])('mondayOf(%s) → %s', (date, monday) => {
      expect(mondayOf(date)).toBe(monday)
   })
   it('lists seven days', () => {
      expect(weekDays('2026-11-16')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
   })
   it('turns a week into instants in a zone (across the DST change on 29 March)', () => {
      expect(weekRange('2026-03-23', 'Europe/Berlin')).toEqual({ from: '2026-03-22T23:00:00Z', to: '2026-03-29T22:00:00Z' })
   })
})

describe('slotOf', () => {
   it.each([
      ['07:30', 'breakfast'],
      ['12:00', 'lunch'],
      ['14:00', 'lunch'],
      ['17:45', 'dinner'],
      ['21:00', 'dinner'],
   ] as const)('%s → %s', (time, slot) => {
      expect(slotOf(time)).toBe(slot)
   })
})
