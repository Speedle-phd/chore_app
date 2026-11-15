import type { Role } from '../models/membershipModel'

const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 }

/** Rename the household, add and edit profiles. */
export const canManage = (role: Role) => RANK[role] >= RANK.admin

/** Only owners grant or take away roles (including owner). */
export const canChangeRoles = (role: Role) => role === 'owner'

export const canDeleteHousehold = (role: Role) => role === 'owner'

/** Owners may remove anyone; admins only people ranked below them. */
export const canRemove = (actor: Role, target: Role) =>
   actor === 'owner' || (canManage(actor) && RANK[actor] > RANK[target])

/** Anyone in the household may add and edit calendar entries; deleting a series is for its creator or admins. */
export const canDeleteCalendarItem = (role: Role, isCreator: boolean) => isCreator || canManage(role)

/**
 * Marking a chore done/skipped for someone: yourself always; profiles (no login,
 * e.g. a child) by anyone; other accounts only by admins and owners.
 */
export const canMarkChoreFor = (role: Role, isSelf: boolean, targetHasLogin: boolean) =>
   isSelf || !targetHasLogin || canManage(role)
