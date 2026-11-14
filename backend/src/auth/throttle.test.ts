import { describe, expect, it } from 'vitest'
import { FREE_ATTEMPTS, lockDurationMs } from './throttle'

describe('lockDurationMs', () => {
   it.each([
      [0, 0],
      [FREE_ATTEMPTS - 1, 0],
      [FREE_ATTEMPTS, 30_000],
      [FREE_ATTEMPTS + 1, 60_000],
      [FREE_ATTEMPTS + 2, 120_000],
      [FREE_ATTEMPTS + 4, 480_000],
      [FREE_ATTEMPTS + 5, 900_000], // 960 s capped at 15 min
      [FREE_ATTEMPTS + 50, 900_000], // never permanent, never more than 15 min
   ])('after %i failures → %i ms', (failures, expected) => {
      expect(lockDurationMs(failures)).toBe(expected)
   })
})
