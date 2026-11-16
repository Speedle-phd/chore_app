import { describe, expect, it } from 'vitest'
import { nextBadge, ordinal } from './format'

describe('nextBadge', () => {
   it('picks the badge closest to its goal', () => {
      expect(
         nextBadge([
            { id: 'first', value: 1, goal: 1 },
            { id: 'ten', value: 3, goal: 10 },
            { id: 'week', value: 5, goal: 7 },
         ])?.id,
      ).toBe('week')
   })
   it('on a tie, the smaller goal', () => {
      expect(
         nextBadge([
            { id: 'heavy', value: 1, goal: 5 },
            { id: 'ten', value: 2, goal: 10 },
         ])?.id,
      ).toBe('heavy')
   })
   it('null when everything is earned', () => {
      expect(nextBadge([{ id: 'first', value: 1, goal: 1 }])).toBeNull()
   })
})

describe('ordinal', () => {
   it.each([
      [1, '1st'],
      [2, '2nd'],
      [3, '3rd'],
      [4, '4th'],
      [11, '11th'],
      [12, '12th'],
      [13, '13th'],
      [21, '21st'],
      [102, '102nd'],
   ])('%i → %s', (n, text) => {
      expect(ordinal(n)).toBe(text)
   })
})
