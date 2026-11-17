import { describe, expect, it } from 'vitest'
import { canVoteFor } from '../households/permissions'
import { applyVote, expiresAt, isOpen, results, voteProblem, type Poll } from './pinboard'

const NOW = new Date('2026-11-17T10:00:00Z')
const at = (iso: string) => new Date(iso)

describe('expiresAt', () => {
   it('adds the preset’s days; never = null', () => {
      expect(expiresAt('day', NOW)?.toISOString()).toBe('2026-11-18T10:00:00.000Z')
      expect(expiresAt('3days', NOW)?.toISOString()).toBe('2026-11-20T10:00:00.000Z')
      expect(expiresAt('week', NOW)?.toISOString()).toBe('2026-11-24T10:00:00.000Z')
      expect(expiresAt('month', NOW)?.toISOString()).toBe('2026-12-17T10:00:00.000Z')
      expect(expiresAt('never', NOW)).toBeNull()
   })
})

describe('isOpen', () => {
   it('is open without a closing time and until it passes; closing by hand ends it', () => {
      expect(isOpen({ closesAt: null, closedAt: null }, NOW)).toBe(true)
      expect(isOpen({ closesAt: at('2026-11-17T10:00:01Z'), closedAt: null }, NOW)).toBe(true)
      expect(isOpen({ closesAt: at('2026-11-17T10:00:00Z'), closedAt: null }, NOW)).toBe(false)
      expect(isOpen({ closesAt: null, closedAt: at('2026-11-17T09:00:00Z') }, NOW)).toBe(false)
   })
})

const poll = (over: Partial<Poll> = {}): Poll => ({
   options: [
      { id: 'a', text: 'Pizza' },
      { id: 'b', text: 'Pasta' },
      { id: 'c', text: 'Curry' },
   ],
   multiple: false,
   closesAt: null,
   closedAt: null,
   votes: [],
   ...over,
})

describe('voteProblem', () => {
   it('accepts one option, or none (withdraw)', () => {
      expect(voteProblem(poll(), ['a'])).toBeNull()
      expect(voteProblem(poll(), [])).toBeNull()
   })
   it('allows several only for multiple choice', () => {
      expect(voteProblem(poll(), ['a', 'b'])).toBe('Pick one option.')
      expect(voteProblem(poll({ multiple: true }), ['a', 'b', 'c'])).toBeNull()
   })
   it('refuses unknown and repeated options', () => {
      expect(voteProblem(poll(), ['z'])).toBe('That option isn’t part of this poll.')
      expect(voteProblem(poll({ multiple: true }), ['a', 'a'])).toBe('Pick each option only once.')
   })
})

describe('applyVote', () => {
   const first = applyVote([], 'ann', ['a'], at('2026-11-17T09:00:00Z'))
   it('adds a vote', () => {
      expect(first).toEqual([{ memberId: 'ann', optionIds: ['a'], at: at('2026-11-17T09:00:00Z') }])
   })
   it('replaces the same person’s earlier vote, keeps others', () => {
      const two = applyVote(first, 'ben', ['b'], at('2026-11-17T09:10:00Z'))
      const changed = applyVote(two, 'ann', ['c'], at('2026-11-17T09:20:00Z'))
      expect(changed.map((v) => [v.memberId, v.optionIds])).toEqual([
         ['ben', ['b']],
         ['ann', ['c']],
      ])
   })
   it('withdraws with no options', () => {
      expect(applyVote(first, 'ann', [], NOW)).toEqual([])
   })
})

describe('results', () => {
   it('counts per option with voters in voting order (named votes)', () => {
      const r = results(
         poll({
            multiple: true,
            votes: [
               { memberId: 'ben', optionIds: ['a', 'b'], at: at('2026-11-17T09:10:00Z') },
               { memberId: 'ann', optionIds: ['a'], at: at('2026-11-17T09:00:00Z') },
            ],
         }),
      )
      expect(r.voters).toBe(2)
      expect(r.options).toEqual([
         { id: 'a', text: 'Pizza', count: 2, voterIds: ['ann', 'ben'] },
         { id: 'b', text: 'Pasta', count: 1, voterIds: ['ben'] },
         { id: 'c', text: 'Curry', count: 0, voterIds: [] },
      ])
   })
})

describe('canVoteFor', () => {
   it('yourself, or a profile; not another account', () => {
      expect(canVoteFor(true, true)).toBe(true)
      expect(canVoteFor(false, false)).toBe(true)
      expect(canVoteFor(false, true)).toBe(false)
   })
})
