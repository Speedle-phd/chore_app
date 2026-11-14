import type { UserType } from '../models/userModel'

/** Public shape of the signed-in user. Never includes the password hash. */
export const userView = (user: UserType) => ({
   id: user._id.toString(),
   email: user.email,
   fname: user.fname,
   lname: user.lname,
   fullName: `${user.fname} ${user.lname}`.trim(),
   emailVerified: Boolean(user.emailVerifiedAt),
   lastHouseholdId: user.lastHouseholdId?.toString() ?? null,
   handle: user.handle ?? null,
   avatarUrl: user.avatarUrl ?? null,
   findableByHandle: Boolean(user.findableByHandle),
})
