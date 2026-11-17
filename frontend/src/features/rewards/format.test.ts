import { describe, expect, it } from 'vitest'
import { points, redeemButton } from './format'
import type { Reward } from './rewardsApi'

const reward = (over: Partial<Reward> = {}): Reward => ({
   id: 'r1',
   title: 'Movie pick',
   description: '',
   cost: 50,
   needsApproval: false,
   archivedAt: null,
   createdBy: 'm1',
   ...over,
})
const balance = (available: number) => ({ earned: available, spent: 0, reserved: 0, available })

describe('points', () => {
   it('uses the singular for one', () => {
      expect(points(1)).toBe('1 point')
      expect(points(0)).toBe('0 points')
      expect(points(-1)).toBe('-1 point')
   })
})

describe('redeemButton', () => {
   it('is usable with enough points', () => {
      expect(redeemButton(reward(), balance(50), false)).toEqual({ label: 'Get it', disabled: false, reason: null })
   })
   it('says how many points are missing', () => {
      expect(redeemButton(reward(), balance(38), false)).toMatchObject({ disabled: true, reason: '12 more points needed' })
      expect(redeemButton(reward({ cost: 5 }), balance(4), false).reason).toBe('1 more point needed')
   })
   it('counts a negative balance as zero', () => {
      expect(redeemButton(reward({ cost: 3 }), balance(-4), false).reason).toBe('3 more points needed')
   })
   it('members ask for rewards that need approval; managers get them at once', () => {
      expect(redeemButton(reward({ needsApproval: true }), balance(60), false).label).toBe('Ask for it')
      expect(redeemButton(reward({ needsApproval: true }), balance(60), true).label).toBe('Get it')
   })
   it('is disabled while the balance is unknown', () => {
      expect(redeemButton(reward(), undefined, false)).toMatchObject({ disabled: true, reason: null })
   })
})
