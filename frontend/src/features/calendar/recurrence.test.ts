import { describe, expect, it } from 'vitest'
import { afterDaysOf, describeRepeat, fromRrule, NO_REPEAT, repeatOf, toRrule, weekdayOf, type Repeat } from './recurrence'

const BERLIN = 'Europe/Berlin'
const weekly = (over: Partial<Repeat> = {}): Repeat => ({ ...NO_REPEAT, freq: 'WEEKLY', ...over })

describe('toRrule', () => {
   it.each<[string, Repeat, string | null]>([
      ['no repeat', NO_REPEAT, null],
      ['daily', { ...NO_REPEAT, freq: 'DAILY' }, 'FREQ=DAILY'],
      ['every 2 weeks on Mon+Thu (ordered)', weekly({ interval: 2, byDay: ['TH', 'MO'] }), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH'],
      ['5 times', weekly({ end: { type: 'count', count: 5 } }), 'FREQ=WEEKLY;COUNT=5'],
      // End of 31 Mar in Berlin (CEST, +02:00) = 21:59:59 UTC.
      ['until a date', weekly({ end: { type: 'until', date: '2026-03-31' } }), 'FREQ=WEEKLY;UNTIL=20260331T215959Z'],
   ])('%s', (_name, repeat, expected) => {
      expect(toRrule(repeat, BERLIN)).toBe(expected)
   })

   it('ignores weekdays for non-weekly repeats', () => {
      expect(toRrule({ ...NO_REPEAT, freq: 'MONTHLY', byDay: ['MO'] }, BERLIN)).toBe('FREQ=MONTHLY')
   })
})

describe('fromRrule', () => {
   it('round-trips what the editor produces', () => {
      const cases: Repeat[] = [
         weekly({ interval: 2, byDay: ['MO', 'TH'] }),
         weekly({ end: { type: 'count', count: 3 } }),
         weekly({ end: { type: 'until', date: '2026-03-31' } }),
         { ...NO_REPEAT, freq: 'YEARLY' },
      ]
      for (const repeat of cases) expect(fromRrule(toRrule(repeat, BERLIN), BERLIN)).toEqual(repeat)
   })

   it('reads an UNTIL written by the server when splitting a series', () => {
      expect(fromRrule('FREQ=WEEKLY;UNTIL=20260330T170000Z', BERLIN)).toEqual(
         weekly({ end: { type: 'until', date: '2026-03-30' } }),
      )
   })

   it.each(['FREQ=MONTHLY;BYMONTHDAY=-1', 'FREQ=WEEKLY;BYDAY=1MO', 'FREQ=HOURLY', 'FREQ=YEARLY;BYMONTH=3'])(
      '%s is custom',
      (rrule) => {
         expect(fromRrule(rrule, BERLIN)).toBe('custom')
      },
   )
})

describe('describeRepeat and weekdayOf', () => {
   it('describes rules', () => {
      expect(describeRepeat(null, BERLIN)).toBe('Does not repeat')
      expect(describeRepeat('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=5', BERLIN)).toBe('Every 2 weeks on Mon, Thu, 5 times')
      expect(describeRepeat('FREQ=DAILY;COUNT=1', BERLIN)).toBe('Every day, 1 time')
      expect(describeRepeat('FREQ=MONTHLY;BYMONTHDAY=-1', BERLIN)).toBe('Custom repeat')
   })
   it('finds the weekday of a local start', () => {
      expect(weekdayOf('2026-11-16T19:00')).toBe('MO')
      expect(weekdayOf('2026-11-22')).toBe('SU')
   })
})

describe('repeat after completion', () => {
   it('maps to afterDays, not an RRULE, and back', () => {
      const after: Repeat = { ...NO_REPEAT, freq: 'AFTER', interval: 3 }
      expect(toRrule(after, BERLIN)).toBeNull()
      expect(afterDaysOf(after)).toBe(3)
      expect(afterDaysOf(weekly())).toBeNull()
      expect(repeatOf(null, 3, BERLIN)).toEqual(after)
      expect(repeatOf('FREQ=WEEKLY', null, BERLIN)).toEqual(weekly())
   })
   it('describes it', () => {
      expect(describeRepeat(null, BERLIN, 3)).toBe('3 days after it’s done')
      expect(describeRepeat(null, BERLIN, 1)).toBe('The day after it’s done')
   })
})
