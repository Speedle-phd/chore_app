import { describe, expect, it } from 'vitest'
import { earnBadges } from './badges'
import { activitySeries, choreStats, creditedCompletions, fairShare, memberStats, streaks, totals, type StatsRow } from './stats'

const TZ = 'Europe/Berlin'
const ms = (iso: string) => Date.parse(iso)
const row = (over: Partial<StatsRow>): StatsRow => ({
   itemId: 'dishes',
   title: 'Dishes',
   effort: 2,
   mode: 'anyone',
   date: '2026-03-23',
   due: ms('2026-03-23T19:30:00Z'),
   assignees: ['ada'],
   state: 'open',
   overdue: false,
   completions: [],
   ...over,
})
const done = (memberId: string, at: string) => ({ memberId, status: 'done' as const, at: ms(at) })

describe('points and credit', () => {
   it('"any one of them": only the first done counts', () => {
      const r = row({ completions: [done('ben', '2026-03-23T19:00:00Z'), done('ada', '2026-03-23T18:00:00Z')], state: 'done' })
      expect(creditedCompletions(r).map((c) => c.memberId)).toEqual(['ada'])
   })
   it('"each of them": every assignee who did their part', () => {
      const r = row({ mode: 'everyone', assignees: ['ada', 'kid'], completions: [done('ada', '2026-03-23T18:00:00Z'), done('kid', '2026-03-23T18:30:00Z'), done('x', '2026-03-23T18:40:00Z')] })
      expect(creditedCompletions(r).map((c) => c.memberId)).toEqual(['ada', 'kid'])
   })
})

describe('memberStats, totals, fair share', () => {
   const rows = [
      row({ completions: [done('ada', '2026-03-23T18:00:00Z')], state: 'done' }),
      row({ date: '2026-03-24', due: ms('2026-03-24T19:30:00Z'), completions: [done('ada', '2026-03-24T21:00:00Z')], state: 'done' }),
      row({ date: '2026-03-25', due: ms('2026-03-25T19:30:00Z'), assignees: ['ben'], overdue: true }),
      row({ itemId: 'bins', title: 'Bins', effort: 1, assignees: ['ben'], completions: [{ memberId: 'ben', status: 'skipped', at: ms('2026-03-23T10:00:00Z') }], state: 'skipped' }),
   ]
   it('counts points, on time, missed and skipped per member', () => {
      expect(memberStats(rows, ['ada', 'ben', 'kid'])).toEqual([
         { memberId: 'ada', points: 4, done: 2, onTime: 1, skipped: 0, assigned: 2, missed: 0 },
         { memberId: 'ben', points: 0, done: 0, onTime: 0, skipped: 1, assigned: 2, missed: 1 },
         { memberId: 'kid', points: 0, done: 0, onTime: 0, skipped: 0, assigned: 0, missed: 0 },
      ])
   })
   it('totals and on-time rate', () => {
      expect(totals(rows)).toEqual({ done: 2, onTime: 1, points: 4, skipped: 1, missed: 1, onTimeRate: 0.5 })
   })
   it('fair share splits among people who had chores', () => {
      expect(fairShare(memberStats(rows, ['ada', 'ben', 'kid']))).toBe(0.5)
      expect(fairShare(memberStats([], ['ada']))).toBeNull()
   })
   it('per chore, most done by', () => {
      expect(choreStats(rows)).toEqual([
         { itemId: 'dishes', title: 'Dishes', done: 2, skipped: 0, missed: 1, topMemberId: 'ada' },
         { itemId: 'bins', title: 'Bins', done: 0, skipped: 1, missed: 0, topMemberId: null },
      ])
   })
})

describe('activitySeries', () => {
   const rows = [
      row({ completions: [done('ada', '2026-03-23T18:00:00Z')] }),
      // 23:30 UTC on the 24th is the 25th in Berlin.
      row({ completions: [done('ada', '2026-03-24T23:30:00Z')] }),
   ]
   it('buckets by completion day in the zone', () => {
      expect(activitySeries(rows, '2026-03-23', '2026-03-26', TZ, 'day')).toEqual([
         { date: '2026-03-23', points: 2, done: 1 },
         { date: '2026-03-24', points: 0, done: 0 },
         { date: '2026-03-25', points: 2, done: 1 },
      ])
   })
   it('weeks start on Monday', () => {
      expect(activitySeries(rows, '2026-03-23', '2026-04-06', TZ, 'week').map((p) => [p.date, p.points])).toEqual([
         ['2026-03-23', 4],
         ['2026-03-30', 0],
      ])
   })
})

describe('streaks', () => {
   it.each([
      [['2026-03-20', '2026-03-21', '2026-03-22'], '2026-03-23', { current: 3, best: 3 }],
      [['2026-03-20', '2026-03-21', '2026-03-23'], '2026-03-23', { current: 1, best: 2 }],
      [['2026-03-18', '2026-03-19'], '2026-03-23', { current: 0, best: 2 }],
      [[], '2026-03-23', { current: 0, best: 0 }],
   ])('%j on %s → %j', (days, today, expected) => {
      expect(streaks(days, today)).toEqual(expected)
   })
})

describe('earnBadges', () => {
   it('earns at the moment the goal is reached', () => {
      const rows = Array.from({ length: 10 }, (_, i) =>
         row({ date: `2026-03-${String(10 + i).padStart(2, '0')}`, due: ms(`2026-03-${String(10 + i).padStart(2, '0')}T20:00:00Z`), completions: [done('ada', `2026-03-${String(10 + i).padStart(2, '0')}T18:00:00Z`)] }),
      )
      const earned = earnBadges(rows, 'ada', TZ)
      expect(earned.map((b) => b.id)).toEqual(['first', 'week', 'ten'])
      expect(earned.find((b) => b.id === 'week')?.earnedAt).toBe(ms('2026-03-16T18:00:00Z'))
   })
   it('stand-in and heavy lifter', () => {
      const rows = Array.from({ length: 5 }, (_, i) =>
         row({ effort: 5, assignees: ['ben'], completions: [done('ada', `2026-02-0${i + 1}T10:00:00Z`)] }),
      )
      expect(earnBadges(rows, 'ada', TZ).map((b) => b.id)).toEqual(['first', 'heavy', 'standin'])
      expect(earnBadges(rows, 'ben', TZ)).toEqual([])
   })
})
