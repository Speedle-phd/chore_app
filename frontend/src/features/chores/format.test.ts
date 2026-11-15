import { describe, expect, it } from 'vitest'
import { conflictText, dateOf, dayLabel, isMine, whenText } from './format'

const BERLIN = 'Europe/Berlin'

describe('chore formatting', () => {
   it('finds the viewer’s date of an occurrence', () => {
      expect(dateOf({ allDay: false, start: '2026-03-24T23:30:00Z' }, BERLIN)).toBe('2026-03-25')
      expect(dateOf({ allDay: true, start: '2026-03-24' }, BERLIN)).toBe('2026-03-24')
   })

   it.each([
      ['2026-03-25', 'Today'],
      ['2026-03-26', 'Tomorrow'],
      ['2026-03-24', 'Yesterday'],
      ['2026-03-30', 'Mon 30 Mar'],
   ])('labels %s as %s', (date, label) => {
      expect(dayLabel(date, '2026-03-25', 'en-GB')).toBe(label)
   })

   it('combines day and time', () => {
      expect(whenText({ allDay: false, start: '2026-03-25T18:00:00Z' }, '2026-03-25', BERLIN, 'en-GB')).toBe('Today · 19:00')
      expect(whenText({ allDay: true, start: '2026-03-26' }, '2026-03-25', BERLIN, 'en-GB')).toBe('Tomorrow · all day')
   })

   it('treats unassigned chores as everyone’s', () => {
      expect(isMine({ memberIds: [] }, 'me')).toBe(true)
      expect(isMine({ memberIds: ['me', 'b'] }, 'me')).toBe(true)
      expect(isMine({ memberIds: ['b'] }, 'me')).toBe(false)
   })
})

describe('conflictText', () => {
   const people = [
      { id: 'a', fname: 'Ada' },
      { id: 'b', fname: 'Ben' },
      { id: 'k', fname: 'Kid' },
   ]
   it.each([
      ['someone takes over', { away: ['a'], suggestion: ['b'] }, ['a'], { awayText: 'Ada is away', action: 'Give to Ben' }],
      ['the away person is left out', { away: ['k'], suggestion: ['a'] }, ['a', 'k'], { awayText: 'Kid is away', action: 'Leave Kid out' }],
      ['nobody free', { away: ['a', 'b'], suggestion: null }, ['a', 'b'], { awayText: 'Ada and Ben are away', action: null }],
   ])('%s', (_name, conflict, assignees, expected) => {
      expect(conflictText(conflict, assignees, people)).toEqual(expected)
   })
})
