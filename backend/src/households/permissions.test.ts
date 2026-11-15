import { describe, expect, it } from 'vitest'
import {
   canChangeRoles,
   canDeleteCalendarItem,
   canDeleteHousehold,
   canManage,
   canMarkChoreFor,
   canRemove,
} from './permissions'

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

describe('canDeleteCalendarItem', () => {
   it.each([
      ['member', true, true],
      ['member', false, false],
      ['admin', false, true],
      ['owner', false, true],
   ] as const)('%s (creator: %s) may delete: %s', (role, isCreator, allowed) => {
      expect(canDeleteCalendarItem(role, isCreator)).toBe(allowed)
   })
})

describe('canMarkChoreFor', () => {
   it.each([
      ['member', true, true, true],
      ['member', false, false, true],
      ['member', false, true, false],
      ['admin', false, true, true],
      ['owner', false, true, true],
   ] as const)('%s (self: %s, target has login: %s) may mark: %s', (role, isSelf, hasLogin, allowed) => {
      expect(canMarkChoreFor(role, isSelf, hasLogin)).toBe(allowed)
   })
})
