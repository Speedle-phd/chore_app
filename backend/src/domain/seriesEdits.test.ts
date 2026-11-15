import { Temporal } from 'temporal-polyfill'
import { describe, expect, it } from 'vitest'
import { expandItem, type ItemTiming } from './recurrence'
import { hasDayRules, localDelta, normalizeLocal, shiftLocal, splitSeries, toItemLocal } from './seriesEdits'

const BERLIN = 'Europe/Berlin'
const weekly = (rrule: string, over: Partial<ItemTiming> = {}): ItemTiming & { rrule: string } => ({
   allDay: false,
   start: '2026-03-02T19:00',
   end: '2026-03-02T19:15',
   timezone: BERLIN,
   exdates: [],
   ...over,
   rrule,
})
const starts = (item: ItemTiming, from: string, to: string) =>
   expandItem(item, [], { from: Temporal.Instant.from(from), to: Temporal.Instant.from(to), viewerZone: BERLIN }).map(
      (i) => i.originalStart,
   )

describe('normalizeLocal', () => {
   it.each([
      [true, '2026-02-28', '2026-02-28'],
      [true, '2026-02-30', null],
      [true, '2026-02-28T10:00', null],
      [false, '2026-03-29T02:30', '2026-03-29T02:30'],
      [false, '2026-03-29T25:00', null],
      [false, '2026-03-29T10:00:00', null],
      [false, '2026-03-29', null],
   ])('allDay=%s %s → %s', (allDay, value, expected) => {
      expect(normalizeLocal(allDay, value)).toBe(expected)
   })
})

describe('toItemLocal', () => {
   const timed = { allDay: false, timezone: BERLIN }
   it('converts a dropped instant into the item’s zone', () => {
      expect(toItemLocal(timed, '2026-11-20T20:00:00+01:00')).toBe('2026-11-20T20:00')
      expect(toItemLocal(timed, '2026-11-20T19:00:00Z')).toBe('2026-11-20T20:00')
      expect(toItemLocal({ allDay: false, timezone: 'America/New_York' }, '2026-11-20T20:00:00+01:00')).toBe(
         '2026-11-20T14:00',
      )
   })
   it('rejects a date for a timed item and a time for an all-day item', () => {
      expect(toItemLocal(timed, '2026-11-20')).toBeNull()
      expect(toItemLocal({ allDay: true, timezone: BERLIN }, '2026-11-20T20:00:00+01:00')).toBeNull()
      expect(toItemLocal({ allDay: true, timezone: BERLIN }, '2026-11-20')).toBe('2026-11-20')
   })
})

describe('shifting', () => {
   it('keeps wall-clock deltas across DST', () => {
      const delta = localDelta(false, '2026-03-23T09:00', '2026-03-30T10:30')
      expect(shiftLocal(false, '2026-03-24T09:00', delta)).toBe('2026-03-31T10:30')
   })
   it('shifts all-day dates by whole days', () => {
      const delta = localDelta(true, '2026-01-30', '2026-02-02')
      expect(shiftLocal(true, '2026-02-27', delta)).toBe('2026-03-02')
   })
})

describe('hasDayRules', () => {
   it.each([
      ['FREQ=WEEKLY', false],
      ['FREQ=DAILY;INTERVAL=2;COUNT=5', false],
      ['FREQ=WEEKLY;BYDAY=MO,TH', true],
      ['FREQ=MONTHLY;BYMONTHDAY=-1', true],
      ['FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', true],
   ])('%s → %s', (rrule, expected) => {
      expect(hasDayRules(rrule)).toBe(expected)
   })
})

describe('splitSeries', () => {
   it('ends the first part with the last occurrence before the split (UNTIL in UTC)', () => {
      const item = weekly('FREQ=WEEKLY;BYDAY=MO,TH')
      const { beforeRrule, afterRrule } = splitSeries(item, '2026-03-12T19:00')
      expect(beforeRrule).toBe('FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20260309T180000Z')
      expect(afterRrule).toBe('FREQ=WEEKLY;BYDAY=MO,TH')
      expect(starts({ ...item, rrule: beforeRrule }, '2026-03-01T00:00Z', '2026-04-01T00:00Z')).toEqual([
         '2026-03-02T19:00',
         '2026-03-05T19:00',
         '2026-03-09T19:00',
      ])
   })

   it('splits COUNT so both parts together keep the same number of occurrences', () => {
      const item = weekly('FREQ=WEEKLY;COUNT=5')
      const { beforeRrule, afterRrule } = splitSeries(item, '2026-03-16T19:00')
      expect(beforeRrule).toBe('FREQ=WEEKLY;UNTIL=20260309T180000Z')
      expect(afterRrule).toBe('FREQ=WEEKLY;COUNT=3')
      const tail = { ...item, start: '2026-03-16T19:00', end: '2026-03-16T19:15', rrule: afterRrule }
      expect(starts(tail, '2026-03-01T00:00Z', '2026-06-01T00:00Z')).toEqual([
         '2026-03-16T19:00',
         '2026-03-23T19:00',
         '2026-03-30T19:00',
      ])
   })

   it('counts EXDATE-skipped occurrences toward COUNT (RFC 5545)', () => {
      const item = weekly('FREQ=WEEKLY;COUNT=5', { exdates: ['2026-03-09T19:00'] })
      expect(splitSeries(item, '2026-03-16T19:00').afterRrule).toBe('FREQ=WEEKLY;COUNT=3')
   })

   it('has no first part when splitting at the first occurrence', () => {
      expect(splitSeries(weekly('FREQ=WEEKLY'), '2026-03-02T19:00')).toEqual({
         beforeRrule: null,
         afterRrule: 'FREQ=WEEKLY',
      })
   })

   it('works for all-day series', () => {
      const item = weekly('FREQ=DAILY', { allDay: true, start: '2026-03-01', end: '2026-03-02' })
      const { beforeRrule } = splitSeries(item, '2026-03-04')
      expect(beforeRrule).toBe('FREQ=DAILY;UNTIL=20260303T000000Z')
      expect(starts({ ...item, rrule: beforeRrule }, '2026-02-01T00:00Z', '2026-04-01T00:00Z')).toEqual([
         '2026-03-01',
         '2026-03-02',
         '2026-03-03',
      ])
   })
})
