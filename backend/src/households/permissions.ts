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
