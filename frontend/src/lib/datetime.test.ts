import { describe, expect, it } from 'vitest'
import { formatTime, monthGrid, parseTime, timeSlots } from './datetime'

describe('monthGrid', () => {
   it('starts on Monday and pads with neighbouring days', () => {
      const weeks = monthGrid('2026-11')
      expect(weeks[0]?.[0]).toBe('2026-10-26')
      expect(weeks.at(-1)?.at(-1)).toBe('2026-12-06')
      expect(weeks).toHaveLength(6)
   })
   it('February 2027 starts on a Monday: exactly 4 weeks', () => {
      expect(monthGrid('2027-02')).toHaveLength(4)
   })
})

describe('parseTime', () => {
   it.each([
      ['19:30', '19:30'],
      ['7:30 pm', '19:30'],
      ['7pm', '19:00'],
      ['12am', '00:00'],
      ['12:15 PM', '12:15'],
      ['730', '07:30'],
      ['19.30', '19:30'],
      ['9', '09:00'],
      ['24:00', null],
      ['13pm', null],
      ['7:75', null],
      ['soon', null],
   ])('%s → %s', (text, expected) => {
      expect(parseTime(text)).toBe(expected)
   })
})

describe('formatTime and slots', () => {
   it('formats 24 h and 12 h', () => {
      expect(formatTime('07:05', false)).toBe('07:05')
      expect(formatTime('00:30', true)).toBe('12:30 AM')
      expect(formatTime('19:30', true)).toBe('7:30 PM')
   })
   it('makes 96 quarter-hour slots', () => {
      const slots = timeSlots()
      expect(slots).toHaveLength(96)
      expect(slots[1]).toBe('00:15')
      expect(slots.at(-1)).toBe('23:45')
   })
})
