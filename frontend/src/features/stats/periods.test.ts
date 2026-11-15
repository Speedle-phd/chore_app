import { describe, expect, it } from 'vitest'
import { niceTicks, periodRange } from './periods'

describe('periodRange', () => {
   it.each([
      ['week', { from: '2026-11-16', to: '2026-11-23' }],
      ['month', { from: '2026-11-01', to: '2026-12-01' }],
      ['30days', { from: '2026-10-21', to: '2026-11-20' }],
      ['year', { from: '2026-01-01', to: '2027-01-01' }],
   ] as const)('%s on Thu 19 Nov 2026', (id, expected) => {
      expect(periodRange(id, '2026-11-19')).toEqual(expected)
   })
})

describe('niceTicks', () => {
   it.each([
      [0, [0, 1]],
      [7, [0, 5, 10]],
      [12, [0, 5, 10, 15]],
      [3, [0, 1, 2, 3]],
      [140, [0, 50, 100, 150]],
   ])('max %d → %j', (max, ticks) => {
      expect(niceTicks(max)).toEqual(ticks)
   })
})
