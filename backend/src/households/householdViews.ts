import type { Types } from 'mongoose'
import type { HouseholdType } from '../models/householdModel'
import type { MembershipType, Role } from '../models/membershipModel'

export const householdView = (household: HouseholdType, role: Role, memberCount: number) => ({
   id: household._id.toString(),
   name: household.name,
   role,
   memberCount,
   motivation: {
      leaderboard: household.motivation?.leaderboard ?? true,
      badges: household.motivation?.badges ?? true,
      streaks: household.motivation?.streaks ?? true,
   },
   region: { state: household.region?.state ?? null },
   createdAt: household.createdAt.toISOString(),
})

type UserInfo = {
   _id: Types.ObjectId
   fname: string
   lname: string
   email: string
   avatarUrl?: string | null
   birthday?: string | null
}

/** A person in the household; account details come from the user, profiles from the membership. */
export function memberView(membership: MembershipType, user: UserInfo | null, meId: Types.ObjectId) {
   const isAccount = Boolean(membership.userId)
   const fname = (isAccount ? user?.fname : membership.profile?.fname) ?? ''
   const lname = (isAccount ? user?.lname : membership.profile?.lname) ?? ''
   return {
      id: membership._id.toString(),
      kind: isAccount ? ('account' as const) : ('profile' as const),
      role: membership.role,
      fname,
      lname,
      fullName: `${fname} ${lname}`.trim(),
      // Visible only to fellow members of this household.
      email: isAccount ? (user?.email ?? null) : null,
      avatarUrl: (isAccount ? user?.avatarUrl : membership.profile?.avatarUrl) ?? null,
      birthday: (isAccount ? user?.birthday : membership.profile?.birthday) ?? null,
      isMe: Boolean(membership.userId?.equals(meId)),
      joinedAt: membership.createdAt.toISOString(),
   }
}
