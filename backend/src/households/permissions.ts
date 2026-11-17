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

/** Deleting something shared, like a shopping list or a recipe: who made it, or admins and owners. */
export const canDeleteShared = (role: Role, isCreator: boolean) => isCreator || canManage(role)

/**
 * Marking a chore done/skipped for someone: yourself always; profiles (no login,
 * e.g. a child) by anyone; other accounts only by admins and owners.
 */
export const canMarkChoreFor = (role: Role, isSelf: boolean, targetHasLogin: boolean) =>
   isSelf || !targetHasLogin || canManage(role)

/**
 * Spending someone's reward points: your own; a profile's (no login, e.g. a child)
 * only by admins and owners, so a sibling can't spend a kid's pocket money.
 */
export const canRedeemFor = (role: Role, isSelf: boolean, targetHasLogin: boolean) =>
   isSelf || (!targetHasLogin && canManage(role))

/** Voting in a pinboard poll: as yourself; for profiles (no login) anyone may, like marking their chores. */
export const canVoteFor = (isSelf: boolean, targetHasLogin: boolean) => isSelf || !targetHasLogin
