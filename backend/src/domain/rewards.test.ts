import { describe, expect, it } from 'vitest'
import { canRedeemFor } from '../households/permissions'
import { balance, initialStatus, nextStatus, REDEMPTION_STATUSES, type RedemptionAction } from './rewards'

describe('balance', () => {
   it('is everything earned when nothing was spent', () => {
      expect(balance(40, [])).toEqual({ earned: 40, spent: 0, reserved: 0, available: 40 })
   })

   it('subtracts approved rewards and reserves pending ones; others give points back', () => {
      const r = balance(100, [
         { cost: 30, status: 'approved' },
         { cost: 20, status: 'pending' },
         { cost: 50, status: 'declined' },
         { cost: 50, status: 'cancelled' },
         { cost: 25, status: 'refunded' },
      ])
      expect(r).toEqual({ earned: 100, spent: 30, reserved: 20, available: 50 })
   })

   it('goes below zero when earned points drop after spending (e.g. a chore was undone)', () => {
      expect(balance(10, [{ cost: 15, status: 'approved' }]).available).toBe(-5)
   })
})

describe('nextStatus', () => {
   const table: [string, RedemptionAction, string | null][] = [
      ['pending', 'approve', 'approved'],
      ['pending', 'decline', 'declined'],
      ['pending', 'cancel', 'cancelled'],
      ['pending', 'refund', null],
      ['approved', 'refund', 'refunded'],
      ['approved', 'approve', null],
      ['approved', 'cancel', null],
      ['declined', 'approve', null],
      ['cancelled', 'approve', null],
      ['refunded', 'refund', null],
   ]
   it.each(table)('%s + %s → %s', (from, action, to) => {
      expect(nextStatus(from as (typeof REDEMPTION_STATUSES)[number], action)).toBe(to)
   })

   it('final states allow nothing', () => {
      for (const from of ['declined', 'cancelled', 'refunded'] as const) {
         for (const action of ['approve', 'decline', 'cancel', 'refund'] as const) expect(nextStatus(from, action)).toBeNull()
      }
   })
})

describe('initialStatus', () => {
   it('waits only when the reward needs approval and a non-manager asks', () => {
      expect(initialStatus(true, false)).toBe('pending')
      expect(initialStatus(true, true)).toBe('approved')
      expect(initialStatus(false, false)).toBe('approved')
      expect(initialStatus(false, true)).toBe('approved')
   })
})

describe('canRedeemFor', () => {
   it('own points always; a profile’s only by admins and owners; another account’s never', () => {
      expect(canRedeemFor('member', true, true)).toBe(true)
      expect(canRedeemFor('member', false, false)).toBe(false)
      expect(canRedeemFor('admin', false, false)).toBe(true)
      expect(canRedeemFor('owner', false, false)).toBe(true)
      expect(canRedeemFor('owner', false, true)).toBe(false)
   })
})
