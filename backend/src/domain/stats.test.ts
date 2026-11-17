import { describe, expect, it } from 'vitest'
import { BADGE_ACCESSORIES, BADGE_ANIMALS, BADGES, badgeProgress, earnBadges } from './badges'
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

describe('time-of-day, weekend and variety badges (local time)', () => {
   // 10 completions each; Berlin is UTC+1 in February.
   const at = (day: number, utcTime: string) => `2026-02-${String(day).padStart(2, '0')}T${utcTime}Z`
   const progress = (rows: StatsRow[]) => Object.fromEntries(badgeProgress(rows, 'ada', TZ, 0).map((p) => [p.id, p.value]))

   it('early bird: before 08:00 local', () => {
      const early = Array.from({ length: 10 }, (_, i) => row({ completions: [done('ada', at(i + 2, '06:30:00'))] })) // 07:30 Berlin
      expect(earnBadges(early, 'ada', TZ).map((b) => b.id)).toContain('early')
      const notEarly = Array.from({ length: 10 }, (_, i) => row({ completions: [done('ada', at(i + 2, '07:00:00'))] })) // 08:00 Berlin
      expect(progress(notEarly).early).toBe(0)
   })

   it('night owl: from 21:00 local', () => {
      const late = Array.from({ length: 10 }, (_, i) => row({ completions: [done('ada', at(i + 2, '20:00:00'))] })) // 21:00 Berlin
      expect(earnBadges(late, 'ada', TZ).map((b) => b.id)).toContain('night')
      expect(progress(late.slice(0, 3)).night).toBe(3)
   })

   it('weekend: Saturdays and Sundays in the zone', () => {
      // 7 and 8 Feb 2026 are Sat and Sun; 23:30 UTC on Friday the 6th is already Saturday in Berlin.
      const rows = [row({ completions: [done('ada', at(6, '23:30:00'))] }), row({ completions: [done('ada', at(8, '12:00:00'))] }), row({ completions: [done('ada', at(9, '12:00:00'))] })]
      expect(progress(rows).weekend).toBe(2)
   })

   it('variety: different chores, not repeats', () => {
      const rows = Array.from({ length: 12 }, (_, i) => row({ itemId: `chore-${i % 10}`, completions: [done('ada', at(i + 2, '12:00:00'))] }))
      expect(progress(rows.slice(0, 5)).variety).toBe(5)
      expect(earnBadges(rows, 'ada', TZ).map((b) => b.id)).toContain('variety')
   })
})

describe('badge catalog', () => {
   it('every badge has an animal, an accessory, a positive goal and a unique id and name', () => {
      expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length)
      expect(new Set(BADGES.map((b) => b.name)).size).toBe(BADGES.length)
      for (const b of BADGES) {
         expect(BADGE_ANIMALS).toContain(b.animal)
         expect(BADGE_ACCESSORIES).toContain(b.accessory)
         expect(b.goal).toBeGreaterThan(0)
      }
      // All eight animals appear.
      expect(new Set(BADGES.map((b) => b.animal)).size).toBe(BADGE_ANIMALS.length)
   })
})

describe('badgeProgress', () => {
   // Three done: 10–12 March; the 11th is effort 4, the 12th was done after it was due.
   const rows = [
      row({ due: ms('2026-03-10T20:00:00Z'), completions: [done('ada', '2026-03-10T18:00:00Z')] }),
      row({ effort: 4, due: ms('2026-03-11T20:00:00Z'), completions: [done('ada', '2026-03-11T18:00:00Z')] }),
      row({ due: ms('2026-03-12T08:00:00Z'), completions: [done('ada', '2026-03-12T18:00:00Z')] }),
   ]
   it('counts towards each goal; earned ones are full; streak badges use the current streak', () => {
      const progress = Object.fromEntries(badgeProgress(rows, 'ada', TZ, 2).map((p) => [p.id, `${p.value}/${p.goal}`]))
      expect(progress).toEqual({
         first: '1/1',
         ten: '3/10',
         twentyfive: '3/25',
         fifty: '3/50',
         hundred: '3/100',
         legend: '3/250',
         punctual: '2/20',
         wise: '2/100',
         heavy: '1/5',
         titan: '1/25',
         standin: '0/5',
         guardian: '0/20',
         week: '2/7',
         month: '2/30',
         early: '0/10',
         night: '0/10',
         weekend: '0/10',
         variety: '1/10',
      })
   })
   it('someone with nothing done starts at zero', () => {
      expect(badgeProgress(rows, 'ben', TZ, 0).every((p) => p.value === 0)).toBe(true)
   })
})
