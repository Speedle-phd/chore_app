import { Temporal } from 'temporal-polyfill'
import { describe, expect, it } from 'vitest'
import { assigneesFor, choreState, isOverdue, nextAfterCompletion, rotateFrom, tooEarly, type Completion } from './chores'

const done = (memberId: string): Completion => ({ memberId, status: 'done' })
const skipped = (memberId: string): Completion => ({ memberId, status: 'skipped' })

describe('assigneesFor', () => {
   it.each([
      ['no rotation: the whole pool', ['a', 'b'], false, 5, null, ['a', 'b']],
      ['rotation takes turns by position', ['a', 'b', 'c'], true, 4, null, ['b']],
      ['rotation with one person', ['a'], true, 3, null, ['a']],
      ['a reassignment wins', ['a', 'b'], true, 0, ['c'], ['c']],
      ['an explicit "nobody" reassignment wins too', ['a', 'b'], false, 0, [], []],
   ] as const)('%s', (_name, pool, rotation, index, reassigned, expected) => {
      expect(assigneesFor([...pool], rotation, index, reassigned ? [...reassigned] : null)).toEqual(expected)
   })
})

describe('choreState', () => {
   it.each<[string, 'anyone' | 'everyone', string[], Completion[], string]>([
      ['anyone: nothing yet', 'anyone', ['a', 'b'], [], 'open'],
      ['anyone: one done settles it', 'anyone', ['a', 'b'], [done('b')], 'done'],
      ['anyone: someone outside the assignees did it', 'anyone', ['a'], [done('x')], 'done'],
      ['anyone: skipped', 'anyone', ['a'], [skipped('a')], 'skipped'],
      ['everyone: one of two', 'everyone', ['a', 'b'], [done('a')], 'partial'],
      ['everyone: all done', 'everyone', ['a', 'b'], [done('a'), done('b')], 'done'],
      ['everyone: one done, one skipped', 'everyone', ['a', 'b'], [done('a'), skipped('b')], 'done'],
      ['everyone: all skipped', 'everyone', ['a', 'b'], [skipped('a'), skipped('b')], 'skipped'],
      ['everyone: non-assignee completions do not count', 'everyone', ['a', 'b'], [done('a'), done('x')], 'partial'],
      ['everyone with nobody assigned acts like anyone', 'everyone', [], [done('x')], 'done'],
   ])('%s', (_name, mode, assignees, completions, expected) => {
      expect(choreState(mode, assignees, completions)).toBe(expected)
   })
})

describe('due and early', () => {
   const due = Temporal.Instant.from('2026-11-16T18:15:00Z')
   it('is overdue from the due time on, unless settled', () => {
      expect(isOverdue('open', due, Temporal.Instant.from('2026-11-16T18:14:59Z'))).toBe(false)
      expect(isOverdue('open', due, due)).toBe(true)
      expect(isOverdue('partial', due, due)).toBe(true)
      expect(isOverdue('done', due, Temporal.Instant.from('2026-12-01T00:00:00Z'))).toBe(false)
   })
   it('allows marking up to 7 days ahead', () => {
      const now = Temporal.Instant.from('2026-11-16T12:00:00Z')
      expect(tooEarly(Temporal.Instant.from('2026-11-23T12:00:00Z'), now)).toBe(false)
      expect(tooEarly(Temporal.Instant.from('2026-11-23T12:00:01Z'), now)).toBe(true)
   })
})

describe('nextAfterCompletion', () => {
   const plants = { allDay: false, start: '2026-11-10T09:00', end: '2026-11-10T09:30', timezone: 'Europe/Berlin' }

   it('is N days after the day it was done, at the same time of day', () => {
      // Done late on the 12th Berlin time (23:30 = 22:30Z) → counts as the 12th.
      expect(nextAfterCompletion(plants, Temporal.Instant.from('2026-11-12T22:30:00Z'), 3)).toEqual({
         start: '2026-11-15T09:00',
         end: '2026-11-15T09:30',
      })
   })

   it('uses the item’s zone to decide the day', () => {
      // 23:30Z on the 12th is already the 13th in Berlin.
      expect(nextAfterCompletion(plants, Temporal.Instant.from('2026-11-12T23:30:00Z'), 3).start).toBe('2026-11-16T09:00')
   })

   it('keeps the length of all-day chores', () => {
      const clean = { allDay: true, start: '2026-11-10', end: '2026-11-12', timezone: 'Europe/Berlin' }
      expect(nextAfterCompletion(clean, Temporal.Instant.from('2026-11-14T10:00:00Z'), 7)).toEqual({
         start: '2026-11-21',
         end: '2026-11-23',
      })
   })
})

describe('rotateFrom', () => {
   it('starts the order at the split position', () => {
      expect(rotateFrom(['a', 'b', 'c'], 4)).toEqual(['b', 'c', 'a'])
      expect(rotateFrom(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
      expect(rotateFrom([], 3)).toEqual([])
   })
})
