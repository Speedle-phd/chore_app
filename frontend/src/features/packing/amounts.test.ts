import { describe, expect, it } from 'vitest'
import { describeAmount, formatAmount, parseAmount, tripDaysOf } from './amounts'

describe('parseAmount', () => {
   it.each([
      ['', {}, null],
      ['  ', {}, null],
      ['3', {}, 3],
      ['1.5', {}, undefined],
      ['0', {}, undefined],
      ['100', {}, undefined],
      ['abc', {}, undefined],
      ['0,5', { halves: true }, 0.5],
      ['½', { halves: true }, 0.5],
      ['1½', { halves: true }, 1.5],
      ['0.3', { halves: true }, undefined],
   ] as const)('%j %j → %s', (text, options, expected) => {
      expect(parseAmount(text, options)).toBe(expected)
   })
})

describe('formatAmount / describeAmount', () => {
   it('writes halves as ½', () => {
      expect([formatAmount(0.5), formatAmount(1.5), formatAmount(3)]).toEqual(['½', '1½', '3'])
   })

   it('describes template amounts', () => {
      expect(describeAmount({ amount: null, perDay: false, maxAmount: null })).toBe('')
      expect(describeAmount({ amount: 2, perDay: false, maxAmount: null })).toBe('2')
      expect(describeAmount({ amount: 1, perDay: true, maxAmount: 7 })).toBe('1 a day, at most 7')
      expect(describeAmount({ amount: 0.5, perDay: true, maxAmount: null })).toBe('½ a day')
   })
})

describe('tripDaysOf', () => {
   it('all-day entries end the day after', () => {
      expect(tripDaysOf({ allDay: true, start: '2026-12-10', end: '2026-12-14' }, 'Europe/Berlin')).toBe(4)
   })

   it('timed entries count each day they touch', () => {
      expect(tripDaysOf({ allDay: false, start: '2026-12-11T17:00:00.000Z', end: '2026-12-13T19:00:00.000Z' }, 'Europe/Berlin')).toBe(3)
   })

   it('is null for unreadable or empty ranges', () => {
      expect(tripDaysOf({ allDay: true, start: '2026-12-10', end: '2026-12-10' }, 'Europe/Berlin')).toBeNull()
      expect(tripDaysOf({ allDay: true, start: 'soon', end: 'later' }, 'Europe/Berlin')).toBeNull()
   })
})
