import { Temporal } from 'temporal-polyfill'
import { describe, expect, it } from 'vitest'
import { digestDate, digestGroups, type DigestReminder } from './digest'

describe('digestDate', () => {
   it.each([
      ['2026-11-16T06:59:00Z', 'Europe/Berlin', null], // 07:59 in Berlin
      ['2026-11-16T07:00:00Z', 'Europe/Berlin', '2026-11-16'], // 08:00 in Berlin
      ['2026-11-16T12:00:00Z', 'America/New_York', null], // 07:00 in New York
      ['2026-11-16T13:00:00Z', 'America/New_York', '2026-11-16'],
      ['2026-11-16T23:30:00Z', 'Europe/Berlin', null], // 00:30 on the 17th: before 08:00
   ])('%s in %s → %s', (now, zone, expected) => {
      expect(digestDate(Temporal.Instant.from(now), zone)).toBe(expected)
   })
})

describe('digestGroups', () => {
   const r = (over: Partial<DigestReminder>): DigestReminder => ({
      household: 'Home',
      title: 'Oma',
      kind: 'birthday',
      date: '2026-11-16',
      leadDays: 0,
      allDay: true,
      start: '2026-11-16',
      age: null,
      ...over,
   })

   it('splits into today and coming up, per household, with ages and times', () => {
      const groups = digestGroups(
         [
            r({ title: 'Oma', age: 80 }),
            r({ title: 'Dentist', kind: 'event', allDay: false, start: '2026-11-17T09:30:00+01:00', date: '2026-11-17', leadDays: 1 }),
            r({ title: 'Ben turns 36', age: 36, date: '2026-11-23', leadDays: 7 }),
            r({ household: 'Cabin', title: 'Water plants', kind: 'event', allDay: false, start: '2026-11-16T18:00:00+01:00' }),
         ],
         'Europe/Berlin',
      )
      expect(groups).toEqual([
         {
            household: 'Home',
            today: [{ title: 'Oma (80)', when: 'all day' }],
            soon: [
               { title: 'Dentist', when: 'tomorrow, Tue 17 Nov at 09:30' },
               { title: 'Ben turns 36', when: 'in 7 days, Mon 23 Nov' },
            ],
         },
         { household: 'Cabin', today: [{ title: 'Water plants', when: '18:00' }], soon: [] },
      ])
   })
})
