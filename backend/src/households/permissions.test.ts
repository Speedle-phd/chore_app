import { describe, expect, it } from 'vitest'
import { canChangeRoles, canDeleteHousehold, canManage, canRemove } from './permissions'

describe('household permissions', () => {
   it.each([
      ['owner', true, true, true],
      ['admin', true, false, false],
      ['member', false, false, false],
   ] as const)('%s: manage=%s, change roles=%s, delete household=%s', (role, manage, roles, del) => {
      expect(canManage(role)).toBe(manage)
      expect(canChangeRoles(role)).toBe(roles)
      expect(canDeleteHousehold(role)).toBe(del)
   })

   it.each([
      ['owner', 'owner', true],
      ['owner', 'admin', true],
      ['owner', 'member', true],
      ['admin', 'owner', false],
      ['admin', 'admin', false],
      ['admin', 'member', true],
      ['member', 'member', false],
      ['member', 'admin', false],
   ] as const)('%s can remove %s: %s', (actor, target, allowed) => {
      expect(canRemove(actor, target)).toBe(allowed)
   })
})
