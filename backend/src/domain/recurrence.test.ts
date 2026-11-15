import { Temporal } from 'temporal-polyfill'
import { describe, expect, it } from 'vitest'
import {
   expandItem,
   isTimeZone,
   rruleProblem,
   seriesSpan,
   type ItemTiming,
   type OccurrenceOverride,
   type Window,
} from './recurrence'

const BERLIN = 'Europe/Berlin'
const win = (from: string, to: string, viewerZone = BERLIN): Window => ({
   from: Temporal.Instant.from(from),
   to: Temporal.Instant.from(to),
   viewerZone,
})
const timed = (over: Partial<ItemTiming> = {}): ItemTiming => ({
   allDay: false,
   start: '2026-03-23T09:00',
   end: '2026-03-23T10:00',
   timezone: BERLIN,
   rrule: null,
   exdates: [],
   ...over,
})
const allDay = (over: Partial<ItemTiming> = {}): ItemTiming => ({
   allDay: true,
   start: '2026-05-12',
   end: '2026-05-13',
   timezone: BERLIN,
   rrule: null,
   exdates: [],
   ...over,
})
const starts = (item: ItemTiming, w: Window, overrides: OccurrenceOverride[] = []) => expandItem(item, overrides, w).map((i) => i.start)

describe('one-off items', () => {
   it('returns the item when it overlaps the window, with its offset', () => {
      expect(expandItem(timed(), [], win('2026-03-23T00:00Z', '2026-03-24T00:00Z'))).toEqual([
         {
            originalStart: '2026-03-23T09:00',
            start: '2026-03-23T09:00:00+01:00',
            end: '2026-03-23T10:00:00+01:00',
            overridden: false,
            index: 0,
         },
      ])
   })

   it.each([
      ['ends exactly at the window start', '2026-03-23T09:00Z', '2026-03-24T00:00Z', 0],
      ['started before and runs into the window', '2026-03-23T08:30Z', '2026-03-24T00:00Z', 1],
      ['starts exactly at the window end', '2026-03-22T00:00Z', '2026-03-23T08:00Z', 0],
   ])('half-open overlap: %s', (_name, from, to, count) => {
      expect(expandItem(timed(), [], win(from, to))).toHaveLength(count)
   })

   it('includes a zero-length entry that starts inside the window', () => {
      const item = timed({ end: '2026-03-23T09:00' })
      expect(expandItem(item, [], win('2026-03-23T08:00Z', '2026-03-23T09:00Z'))).toHaveLength(1)
   })
})

describe('repeating timed items', () => {
   const weekly = timed({ rrule: 'FREQ=WEEKLY' })

   it('keeps the wall-clock time across the spring DST change (29 March 2026 in Berlin)', () => {
      expect(starts(weekly, win('2026-03-20T00:00Z', '2026-04-08T00:00Z'))).toEqual([
         '2026-03-23T09:00:00+01:00',
         '2026-03-30T09:00:00+02:00',
         '2026-04-06T09:00:00+02:00',
      ])
   })

   it('keeps the wall-clock time across the autumn DST change (25 October 2026)', () => {
      const item = timed({ start: '2026-10-19T09:00', end: '2026-10-19T10:00', rrule: 'FREQ=WEEKLY' })
      const result = expandItem(item, [], win('2026-10-18T00:00Z', '2026-10-28T00:00Z'))
      expect(result.map((i) => [i.start, i.end])).toEqual([
         ['2026-10-19T09:00:00+02:00', '2026-10-19T10:00:00+02:00'],
         ['2026-10-26T09:00:00+01:00', '2026-10-26T10:00:00+01:00'],
      ])
   })

   // RFC 5545 §3.3.10: instances at a nonexistent local time "MUST be ignored and
   // MUST NOT be counted as part of the recurrence set".
   it('skips a time that does not exist on the DST day and does not count it', () => {
      const item = timed({ start: '2026-03-27T02:30', end: '2026-03-27T03:00', rrule: 'FREQ=DAILY;COUNT=4' })
      expect(starts(item, win('2026-03-26T00:00Z', '2026-04-02T00:00Z'))).toEqual([
         '2026-03-27T02:30:00+01:00',
         '2026-03-28T02:30:00+01:00',
         '2026-03-30T02:30:00+02:00',
         '2026-03-31T02:30:00+02:00',
      ])
   })

   it('skips EXDATEs', () => {
      const item = { ...weekly, exdates: ['2026-03-30T09:00'] }
      expect(starts(item, win('2026-03-20T00:00Z', '2026-04-08T00:00Z'))).toEqual([
         '2026-03-23T09:00:00+01:00',
         '2026-04-06T09:00:00+02:00',
      ])
   })

   it.each([
      ['COUNT', 'FREQ=WEEKLY;COUNT=2'],
      ['UNTIL (UTC, inclusive)', 'FREQ=WEEKLY;UNTIL=20260330T070000Z'],
   ])('stops at %s', (_name, rrule) => {
      expect(starts(timed({ rrule }), win('2026-03-01T00:00Z', '2026-05-01T00:00Z'))).toEqual([
         '2026-03-23T09:00:00+01:00',
         '2026-03-30T09:00:00+02:00',
      ])
   })

   it('only returns occurrences inside the window, also far after the start', () => {
      const item = timed({ rrule: 'FREQ=WEEKLY;BYDAY=MO,TH' })
      expect(starts(item, win('2030-01-07T00:00Z', '2030-01-14T00:00Z'))).toEqual([
         '2030-01-07T09:00:00+01:00',
         '2030-01-10T09:00:00+01:00',
      ])
   })

   it('caps the number of instances', () => {
      const item = timed({ rrule: 'FREQ=DAILY' })
      expect(expandItem(item, [], win('2026-01-01T00:00Z', '2036-01-01T00:00Z')).length).toBeLessThanOrEqual(1000)
   })
})

describe('overrides', () => {
   const weekly = timed({ rrule: 'FREQ=WEEKLY' })
   const w = win('2026-03-20T00:00Z', '2026-04-08T00:00Z')

   it('moves one occurrence and keeps its duration', () => {
      const result = expandItem(weekly, [{ originalStart: '2026-03-30T09:00', start: '2026-03-31T18:00' }], w)
      expect(result[1]).toEqual({
         originalStart: '2026-03-30T09:00',
         start: '2026-03-31T18:00:00+02:00',
         end: '2026-03-31T19:00:00+02:00',
         overridden: true,
         index: 1,
      })
   })

   it('drops a cancelled occurrence', () => {
      const result = starts(weekly, w, [{ originalStart: '2026-03-30T09:00', cancelled: true }])
      expect(result).toEqual(['2026-03-23T09:00:00+01:00', '2026-04-06T09:00:00+02:00'])
   })

   it('shows an occurrence moved into the window from outside it', () => {
      const moved = [{ originalStart: '2026-04-13T09:00', start: '2026-04-07T09:00' }]
      expect(starts(weekly, w, moved)).toContain('2026-04-07T09:00:00+02:00')
   })

   it('hides an occurrence moved out of the window', () => {
      const moved = [{ originalStart: '2026-03-30T09:00', start: '2026-05-01T09:00' }]
      expect(starts(weekly, w, moved)).not.toContain('2026-03-30T09:00:00+02:00')
      expect(starts(weekly, w, moved)).toHaveLength(2)
   })

   it('ignores overrides for dates that are not occurrences', () => {
      const bogus = [{ originalStart: '2026-04-01T09:00', start: '2026-04-02T09:00' }]
      expect(starts(weekly, w, bogus)).toHaveLength(3)
   })
})

describe('all-day items', () => {
   const birthday = allDay({ rrule: 'FREQ=YEARLY' })

   it.each([
      ['Berlin', BERLIN, '2027-05-11T22:00Z', '2027-05-12T22:00Z'],
      ['Auckland (ahead of UTC)', 'Pacific/Auckland', '2027-05-11T12:00Z', '2027-05-12T12:00Z'],
      ['Los Angeles (behind UTC)', 'America/Los_Angeles', '2027-05-12T07:00Z', '2027-05-13T07:00Z'],
   ])('falls on the same date for a viewer in %s', (_name, zone, from, to) => {
      expect(expandItem(birthday, [], win(from, to, zone))).toEqual([
         { originalStart: '2027-05-12', start: '2027-05-12', end: '2027-05-13', overridden: false, index: 1 },
      ])
   })

   it('is not shown on the neighbouring day', () => {
      expect(expandItem(birthday, [], win('2027-05-12T22:00Z', '2027-05-13T22:00Z'))).toEqual([])
   })

   it('keeps multi-day length (vacation)', () => {
      const vacation = allDay({ start: '2026-07-27', end: '2026-08-08' })
      const [result] = expandItem(vacation, [], win('2026-08-01T00:00Z', '2026-08-02T00:00Z'))
      expect(result).toMatchObject({ start: '2026-07-27', end: '2026-08-08' })
   })
})

describe('seriesSpan', () => {
   it('covers a one-off item', () => {
      expect(seriesSpan(timed())).toEqual({
         from: new Date('2026-03-23T08:00:00Z'),
         to: new Date('2026-03-23T09:00:00Z'),
      })
   })

   it('is open-ended without COUNT or UNTIL', () => {
      expect(seriesSpan(timed({ rrule: 'FREQ=DAILY' })).to).toBeNull()
   })

   it('ends with the last occurrence for COUNT', () => {
      expect(seriesSpan(timed({ rrule: 'FREQ=WEEKLY;COUNT=2' })).to).toEqual(new Date('2026-03-30T08:00:00Z'))
   })

   it('widens to cover moved occurrences', () => {
      const span = seriesSpan(timed({ rrule: 'FREQ=WEEKLY;COUNT=2' }), [
         { originalStart: '2026-03-30T09:00', start: '2026-04-10T09:00' },
      ])
      expect(span.to).toEqual(new Date('2026-04-10T08:00:00Z'))
   })
})

describe('validation helpers', () => {
   it.each([
      ['FREQ=WEEKLY;BYDAY=MO,WE', null],
      ['FREQ=MONTHLY;BYMONTHDAY=-1', null],
      ['FREQ=HOURLY', 'Repeat daily, weekly, monthly or yearly.'],
      ['BYDAY=MO', 'Repeat daily, weekly, monthly or yearly.'],
      ['DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY', 'Invalid repeat rule.'],
      ['FREQ=WEEKLY;BYDAY=XX', 'Invalid repeat rule.'],
   ])('rruleProblem(%s)', (rrule, problem) => {
      expect(rruleProblem(rrule)).toBe(problem)
   })

   it('recognises IANA time zones', () => {
      expect(isTimeZone('Europe/Berlin')).toBe(true)
      expect(isTimeZone('UTC')).toBe(true)
      expect(isTimeZone('Mars/Olympus')).toBe(false)
   })
})

describe('occurrence index (for rotation)', () => {
   const indexes = (item: ItemTiming, w: Window) => expandItem(item, [], w).map((i) => [i.originalStart, i.index])

   it('counts from the first occurrence, also far into the series', () => {
      const item = timed({ rrule: 'FREQ=WEEKLY' })
      expect(indexes(item, win('2026-04-13T00:00Z', '2026-04-20T00:00Z'))).toEqual([['2026-04-13T09:00', 3]])
   })

   it('does not shift when a date is skipped', () => {
      const item = timed({ rrule: 'FREQ=WEEKLY', exdates: ['2026-03-30T09:00'] })
      expect(indexes(item, win('2026-03-20T00:00Z', '2026-04-14T00:00Z'))).toEqual([
         ['2026-03-23T09:00', 0],
         ['2026-04-06T09:00', 2],
         ['2026-04-13T09:00', 3],
      ])
   })

   it('keeps the index of a moved occurrence', () => {
      const item = timed({ rrule: 'FREQ=WEEKLY' })
      const [moved] = expandItem(item, [{ originalStart: '2026-04-13T09:00', start: '2026-04-01T09:00' }], win('2026-04-01T00:00Z', '2026-04-02T00:00Z'))
      expect(moved).toMatchObject({ originalStart: '2026-04-13T09:00', index: 3 })
   })
})

describe('after-completion series', () => {
   const plants = timed({ start: '2026-04-10T09:00', end: '2026-04-10T09:30', afterDays: 4 })
   const history = [
      { originalStart: '2026-04-01T09:00', completed: true },
      { originalStart: '2026-04-06T09:00', completed: true },
   ]

   it('shows completed ones where they were due, then the open one; nothing projected', () => {
      const result = expandItem(plants, history, win('2026-03-30T00:00Z', '2026-05-30T00:00Z'))
      expect(result.map((i) => [i.originalStart, i.index])).toEqual([
         ['2026-04-01T09:00', 0],
         ['2026-04-06T09:00', 1],
         ['2026-04-10T09:00', 2],
      ])
   })

   it('spans from the first completion to the open one', () => {
      expect(seriesSpan(plants, history)).toEqual({
         from: new Date('2026-04-01T07:00:00Z'),
         to: new Date('2026-04-10T07:30:00Z'),
      })
   })
})
