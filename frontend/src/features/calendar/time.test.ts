import { Temporal } from 'temporal-polyfill'
import { describe, expect, it } from 'vitest'
import { addDays, instantToParts, joinLocal, nextHourSlot, partsToInstant, splitLocal } from './time'

describe('calendar time helpers', () => {
   it('converts between instants and input values in a zone (DST-aware)', () => {
      expect(instantToParts('2026-03-30T17:00:00Z', 'Europe/Berlin')).toEqual({ date: '2026-03-30', time: '19:00' })
      expect(partsToInstant({ date: '2026-03-30', time: '19:00' }, 'Europe/Berlin')).toBe('2026-03-30T19:00:00+02:00')
      expect(partsToInstant({ date: '2026-03-23', time: '19:00' }, 'Europe/Berlin')).toBe('2026-03-23T19:00:00+01:00')
   })

   it('splits and joins local strings', () => {
      expect(splitLocal('2026-11-16T19:00')).toEqual({ date: '2026-11-16', time: '19:00' })
      expect(joinLocal({ date: '2026-11-16', time: '19:00' }, true)).toBe('2026-11-16')
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
   })

   it('suggests the next full hour', () => {
      expect(nextHourSlot(Temporal.Instant.from('2026-11-15T22:10:00Z'), 'Europe/Berlin')).toEqual({
         start: { date: '2026-11-16', time: '00:00' },
         end: { date: '2026-11-16', time: '01:00' },
      })
   })
})
