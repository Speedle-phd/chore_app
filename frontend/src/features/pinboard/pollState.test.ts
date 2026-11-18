import { describe, expect, it } from 'vitest'
import type { Poll } from './pinboardApi'
import { applyLocalVote, endLabel, leaders, percent } from './pollState'

const poll = (over: Partial<Poll> = {}): Poll => ({
   multiple: false,
   resultsAfterVote: false,
   resultsVisible: true,
   closesAt: null,
   closedAt: null,
   open: true,
   voters: 2,
   options: [
      { id: 'a', text: 'Pizza', count: 2, voterIds: ['ann', 'ben'] },
      { id: 'b', text: 'Pasta', count: 0, voterIds: [] },
   ],
   ...over,
})

describe('applyLocalVote', () => {
   it('moves a vote and keeps the number of voters', () => {
      const p = applyLocalVote(poll(), 'ben', ['b'])
      expect(p.options.map((o) => [o.count, o.voterIds])).toEqual([
         [1, ['ann']],
         [1, ['ben']],
      ])
      expect(p.voters).toBe(2)
   })
   it('a new voter adds one; taking a vote back removes one', () => {
      expect(applyLocalVote(poll(), 'mia', ['b']).voters).toBe(3)
      const back = applyLocalVote(poll(), 'ann', [])
      expect(back.voters).toBe(1)
      expect(back.options[0]).toMatchObject({ count: 1, voterIds: ['ben'] })
   })
   it('leaves hidden results alone (nothing known locally)', () => {
      const hidden = poll({ resultsVisible: false })
      expect(applyLocalVote(hidden, 'mia', ['a'])).toBe(hidden)
   })
})

describe('percent', () => {
   it('is the share of voters, rounded; 0 without votes or when hidden', () => {
      expect(percent(1, 3)).toBe(33)
      expect(percent(2, 2)).toBe(100)
      expect(percent(0, 0)).toBe(0)
      expect(percent(null, 4)).toBe(0)
   })
})

describe('leaders', () => {
   it('the most voted option(s); none before the first vote', () => {
      expect(leaders(poll())).toEqual(['a'])
      expect(leaders(poll({ options: [{ id: 'a', text: '', count: 1, voterIds: [] }, { id: 'b', text: '', count: 1, voterIds: [] }] }))).toEqual(['a', 'b'])
      expect(leaders(poll({ options: [{ id: 'a', text: '', count: 0, voterIds: [] }] }))).toEqual([])
      expect(leaders(poll({ options: [{ id: 'a', text: '', count: null, voterIds: [] }] }))).toEqual([])
   })
})

describe('endLabel', () => {
   const now = new Date('2026-11-17T12:00:00Z')
   const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString()
   it('counts down to the end', () => {
      expect(endLabel({ open: true, closesAt: null }, now)).toBeNull()
      expect(endLabel({ open: true, closesAt: at(0.5) }, now)).toBe('Ends within the hour')
      expect(endLabel({ open: true, closesAt: at(5) }, now)).toBe('Ends in 5 h')
      expect(endLabel({ open: true, closesAt: at(24) }, now)).toBe('Ends tomorrow')
      expect(endLabel({ open: true, closesAt: at(72) }, now)).toBe('Ends in 3 days')
   })
   it('says “Ended” once closed', () => {
      expect(endLabel({ open: false, closesAt: at(5) }, now)).toBe('Ended')
   })
})
