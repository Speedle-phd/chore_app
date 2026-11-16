import { sync as ical, type VEvent } from 'node-ical'
import { describe, expect, it } from 'vitest'
import { buildFeed, type FeedInstance } from './icalFeed'

const instance = (over: Partial<FeedInstance>): FeedInstance => ({
   id: 'item_2026-03-02',
   kind: 'event',
   title: 'Title',
   notes: '',
   allDay: true,
   start: '2026-03-02',
   end: '2026-03-03',
   memberIds: [],
   chore: null,
   ...over,
})

const feed = (instances: FeedInstance[]) =>
   buildFeed({
      name: 'Home',
      instances,
      names: new Map([
         ['ada', 'Ada'],
         ['ben', 'Ben'],
      ]),
      now: new Date('2026-03-01T00:00:00Z'),
      calendarUrl: 'https://hearth.example/calendar',
   })

describe('buildFeed', () => {
   it('writes all-day dates as DATE values and timed ones in UTC', () => {
      const text = feed([
         instance({ id: 'a_2026-03-02', start: '2026-03-02', end: '2026-03-03' }),
         instance({ id: 'b_2026-03-02T09:00', allDay: false, start: '2026-03-02T09:00:00+01:00', end: '2026-03-02T10:00:00+01:00' }),
      ])
      expect(text).toContain('X-WR-CALNAME:Home')
      expect(text).toContain('DTSTART;VALUE=DATE:20260302\r\nDTEND;VALUE=DATE:20260303')
      expect(text).toContain('DTSTART:20260302T080000Z\r\nDTEND:20260302T090000Z')
   })

   it('round-trips through a parser: stable UIDs, people, done state, notes', () => {
      const text = feed([
         instance({
            id: 'chore_2026-03-02',
            kind: 'chore',
            title: 'Bins, out',
            notes: 'Blue bin',
            memberIds: ['ada', 'ben', 'gone'],
            chore: { state: 'done' },
         }),
      ])
      const events = Object.values(ical.parseICS(text)).filter((c): c is VEvent => c?.type === 'VEVENT')
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
         uid: 'chore_2026-03-02@hearth',
         summary: '✓ Bins, out',
         description: 'Done.\n\nFor: Ada, Ben\n\nBlue bin',
         categories: ['Chore'],
      })
   })
})
