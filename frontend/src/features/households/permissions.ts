import type { Role } from './householdsApi'

// Mirrors backend/src/households/permissions.ts. Only decides which controls
// to show; the server enforces the rules.
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 }

export const canManage = (role: Role) => RANK[role] >= RANK.admin
export const canChangeRoles = (role: Role) => role === 'owner'
export const canDeleteHousehold = (role: Role) => role === 'owner'
export const canRemove = (actor: Role, target: Role) =>
   actor === 'owner' || (canManage(actor) && RANK[actor] > RANK[target])

export const ROLE_LABEL: Record<Role, string> = {
   owner: 'Owner',
   admin: 'Admin',
   member: 'Member',
}

export const canDeleteCalendarItem = (role: Role, isCreator: boolean) => isCreator || canManage(role)

/** Deleting something shared, like a shopping list or a recipe: who made it, or admins and owners. */
export const canDeleteShared = (role: Role, isCreator: boolean) => isCreator || canManage(role)

export const canMarkChoreFor = (role: Role, isSelf: boolean, targetHasLogin: boolean) =>
   isSelf || !targetHasLogin || canManage(role)
