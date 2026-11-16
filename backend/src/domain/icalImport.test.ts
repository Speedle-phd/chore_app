import { describe, expect, it } from 'vitest'
import { IcsReadError, itemInputOf, kindProblem, readIcs } from './icalImport'

const calendar = (...events: string[]) =>
   ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events, 'END:VCALENDAR'].join('\r\n')
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', 'DTSTAMP:20260101T000000Z', ...lines, 'END:VEVENT'].join('\r\n')

const NY = 'America/New_York'

describe('readIcs', () => {
   it('keeps a TZID series in its zone, with skipped and moved occurrences', () => {
      const [weekly] = readIcs(
         calendar(
            vevent(
               'UID:weekly@x',
               'DTSTART;TZID=Europe/Berlin:20260302T090000',
               'DTEND;TZID=Europe/Berlin:20260302T100000',
               'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260601T070000Z',
               'EXDATE;TZID=Europe/Berlin:20260309T090000',
               'SUMMARY:Bins out',
               'DESCRIPTION:Line one\\nLine two',
               'LOCATION:Yard',
            ),
            vevent(
               'UID:weekly@x',
               'RECURRENCE-ID;TZID=Europe/Berlin:20260316T090000',
               'DTSTART;TZID=Europe/Berlin:20260317T110000',
               'DTEND;TZID=Europe/Berlin:20260317T120000',
               'SUMMARY:Bins out',
            ),
            vevent(
               'UID:weekly@x',
               'RECURRENCE-ID;TZID=Europe/Berlin:20260323T090000',
               'DTSTART;TZID=Europe/Berlin:20260323T090000',
               'STATUS:CANCELLED',
               'SUMMARY:Bins out',
            ),
         ),
         NY,
      )
      expect(weekly).toEqual({
         uid: 'weekly@x',
         title: 'Bins out',
         notes: 'Line one\nLine two\n\nLocation: Yard',
         allDay: false,
         start: '2026-03-02T09:00',
         end: '2026-03-02T10:00',
         timezone: 'Europe/Berlin',
         rrule: expect.stringMatching(/^FREQ=WEEKLY;/),
         exdates: ['2026-03-09T09:00', '2026-03-23T09:00'],
         overrides: [{ originalStart: '2026-03-16T09:00', start: '2026-03-17T11:00', end: '2026-03-17T12:00' }],
         problem: null,
      })
      expect(weekly?.rrule?.split(';').sort()).toEqual(['BYDAY=MO', 'FREQ=WEEKLY', 'UNTIL=20260601T070000Z'])
   })

   it('puts UTC times into the importer’s zone and reads DURATION', () => {
      // 12:00 UTC on 10 March 2026 is 08:00 in New York (DST began on 8 March).
      const [utc] = readIcs(calendar(vevent('UID:u', 'DTSTART:20260310T120000Z', 'DURATION:PT90M', 'SUMMARY:Call')), NY)
      expect(utc).toMatchObject({ allDay: false, start: '2026-03-10T08:00', end: '2026-03-10T09:30', timezone: NY })
   })

   it('reads floating times as local time in the importer’s zone; no end → one hour', () => {
      const [floating] = readIcs(calendar(vevent('UID:f', 'DTSTART:20260311T080000', 'SUMMARY:Dentist')), NY)
      expect(floating).toMatchObject({ start: '2026-03-11T08:00', end: '2026-03-11T09:00', timezone: NY })
   })

   it('reads all-day dates (end exclusive; no end → one day)', () => {
      const [week, day] = readIcs(
         calendar(
            vevent('UID:a', 'DTSTART;VALUE=DATE:20260401', 'DTEND;VALUE=DATE:20260408', 'SUMMARY:Holiday'),
            vevent('UID:b', 'DTSTART;VALUE=DATE:20260415', 'SUMMARY:Day off'),
         ),
         NY,
      )
      expect(week).toMatchObject({ allDay: true, start: '2026-04-01', end: '2026-04-08', problem: null })
      expect(day).toMatchObject({ allDay: true, start: '2026-04-15', end: '2026-04-16' })
   })

   it('maps Windows zone names to IANA ones', () => {
      const [meeting] = readIcs(
         calendar(vevent('UID:w', 'DTSTART;TZID="W. Europe Standard Time":20260312T180000', 'SUMMARY:Club')),
         NY,
      )
      expect(meeting).toMatchObject({ start: '2026-03-12T18:00', timezone: 'Europe/Berlin' })
   })

   it('flags cancelled events, ignores to-dos, and gives untitled entries a title', () => {
      const entries = readIcs(
         calendar(
            vevent('UID:c', 'DTSTART;VALUE=DATE:20260401', 'STATUS:CANCELLED', 'SUMMARY:Off'),
            'BEGIN:VTODO\r\nUID:t\r\nSUMMARY:Todo\r\nEND:VTODO',
            vevent('UID:n', 'DTSTART;VALUE=DATE:20260402'),
         ),
         NY,
      )
      expect(entries.map((e) => [e.uid, e.title, e.problem])).toEqual([
         ['c', 'Off', 'It was cancelled in the original calendar.'],
         ['n', '(No title)', null],
      ])
   })

   it('keeps rules the app may refuse later (the item schema decides)', () => {
      const [hourly] = readIcs(calendar(vevent('UID:h', 'DTSTART:20260312T180000Z', 'RRULE:FREQ=HOURLY', 'SUMMARY:x')), NY)
      expect(hourly?.rrule).toBe('FREQ=HOURLY')
   })

   it.each([
      ['plain text', 'hello', 'This isn’t a calendar (.ics) file.'],
      ['no events', calendar(), 'No calendar entries found in this file.'],
   ])('refuses %s', (_, text, message) => {
      expect(() => readIcs(text, NY)).toThrow(new IcsReadError(message))
   })
})

describe('import as a kind', () => {
   const [birthday] = readIcs(calendar(vevent('UID:b', 'DTSTART;VALUE=DATE:19800229', 'RRULE:FREQ=YEARLY', 'SUMMARY:Lea')), NY)
   it('a yearly 29 February birthday falls on the 28th in other years', () => {
      expect(birthday && itemInputOf(birthday, 'birthday').rrule).toBe('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1')
      expect(birthday && itemInputOf(birthday, 'event').rrule).toBe('FREQ=YEARLY')
   })
   it('birthdays must be all-day', () => {
      expect(kindProblem({ allDay: false }, 'birthday')).toBe('Birthdays must be all-day entries.')
      expect(kindProblem({ allDay: true }, 'birthday')).toBeNull()
      expect(kindProblem({ allDay: false }, 'event')).toBeNull()
   })
})
