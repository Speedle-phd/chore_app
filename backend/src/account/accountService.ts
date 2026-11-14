import type { Types } from 'mongoose'
import { verifyPassword } from '../auth/password'
import { clearFailures, lockedForSeconds, recordFailure } from '../auth/throttle'
import type { Sessions } from '../auth/sessions'
import { BadRequestError, ConflictError, NotFoundError, TooManyRequestsError } from '../errors'
import type { HouseholdService } from '../households/householdService'
import { deleteAvatar, saveAvatar } from '../media/avatars'
import { ActionToken } from '../models/actionTokenModel'
import { Household } from '../models/householdModel'
import { Invitation } from '../models/invitationModel'
import { LoginThrottle } from '../models/loginThrottleModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { Passkey } from '../models/passkeyModel'
import { WebAuthnChallenge } from '../models/webauthnChallengeModel'
import { User } from '../models/userModel'
import { realtime } from '../socket/realtime'

type Deps = { households: HouseholdService; sessions: Sessions; avatarDir: string }

type Plan = {
   /** Households where you're the only owner and others with a login remain. */
   blockedBy: { id: string; name: string }[]
   /** Households deleted with your account (you're the only one with a login). */
   willDelete: { id: string; name: string }[]
   /** Households you simply leave. */
   willLeave: { id: string; name: string }[]
}

export function createAccountService({ households, sessions, avatarDir }: Deps) {
   /** Your name/picture appear on member cards in every household you're in, and in your other tabs. */
   async function profileChanged(userId: Types.ObjectId) {
      const memberships = await Membership.find({ userId }).select('householdId').lean()
      for (const m of memberships) realtime.householdChanged(m.householdId, 'members')
      realtime.userChanged(userId, 'profile')
   }

   async function load(userId: Types.ObjectId) {
      const user = await User.findById(userId)
      if (!user) throw new NotFoundError('Account not found')
      return user
   }

   /** What deleting the account would do to each household, decided per membership. */
   async function plan(userId: Types.ObjectId): Promise<Plan & { memberships: Map<string, MembershipType> }> {
      const memberships = await Membership.find({ userId })
      const result: Plan = { blockedBy: [], willDelete: [], willLeave: [] }
      const byHousehold = new Map<string, MembershipType>()
      for (const m of memberships) {
         const household = await Household.findById(m.householdId).lean()
         if (!household) continue
         const entry = { id: household._id.toString(), name: household.name }
         byHousehold.set(entry.id, m)
         const otherOwner = await Membership.exists({ householdId: m.householdId, role: 'owner', _id: { $ne: m._id } })
         if (m.role !== 'owner' || otherOwner) {
            result.willLeave.push(entry)
            continue
         }
         const othersWithLogin = await Membership.exists({
            householdId: m.householdId,
            _id: { $ne: m._id },
            userId: { $type: 'objectId' },
         })
         ;(othersWithLogin ? result.blockedBy : result.willDelete).push(entry)
      }
      return { ...result, memberships: byHousehold }
   }

   return {
      async updateProfile(userId: Types.ObjectId, input: { fname?: string | undefined; lname?: string | undefined }) {
         const user = await load(userId)
         if (input.fname !== undefined) user.fname = input.fname
         if (input.lname !== undefined) user.lname = input.lname
         await user.save()
         await profileChanged(user._id)
         return user
      },

      async setAvatar(userId: Types.ObjectId, image: Buffer) {
         const user = await load(userId)
         const previous = user.avatarUrl
         user.avatarUrl = await saveAvatar(image, avatarDir)
         try {
            await user.save()
         } catch (error) {
            await deleteAvatar(user.avatarUrl, avatarDir)
            throw error
         }
         await deleteAvatar(previous, avatarDir)
         await profileChanged(user._id)
         return user
      },

      async removeAvatar(userId: Types.ObjectId) {
         const user = await load(userId)
         const previous = user.avatarUrl
         user.avatarUrl = null
         await user.save()
         await deleteAvatar(previous, avatarDir)
         await profileChanged(user._id)
         return user
      },

      async deletionCheck(userId: Types.ObjectId): Promise<Plan> {
         const { blockedBy, willDelete, willLeave } = await plan(userId)
         return { blockedBy, willDelete, willLeave }
      },

      /** Permanently deletes the account after re-checking the password. */
      async deleteAccount(userId: Types.ObjectId, password: string, now: Date) {
         const user = await load(userId)
         const wait = await lockedForSeconds(user.email, now)
         if (wait > 0) throw new TooManyRequestsError(`Too many failed attempts. Try again in ${wait} seconds.`, wait)
         if (!(await verifyPassword(user.passwordHash, password))) {
            await recordFailure(user.email, now)
            throw new BadRequestError('Your password is incorrect.', undefined, 'WRONG_PASSWORD')
         }
         await clearFailures(user.email)

         const p = await plan(userId)
         if (p.blockedBy.length) {
            throw new ConflictError(
               `You’re the only owner of ${p.blockedBy.map((h) => h.name).join(', ')}. Make someone else owner first.`,
            )
         }
         for (const h of p.willDelete) {
            const membership = p.memberships.get(h.id)
            if (membership) await households.remove(membership)
         }
         for (const h of p.willLeave) {
            const membership = p.memberships.get(h.id)
            if (membership) await households.leave(membership)
         }

         // Invitations sent by you stop working; invitations to you disappear.
         await Invitation.updateMany({ invitedBy: user._id, revokedAt: null, acceptedAt: null }, { $set: { revokedAt: now } })
         await Invitation.deleteMany({ $or: [{ userId: user._id }, { kind: 'email', email: user.email }] })
         await ActionToken.deleteMany({ userId: user._id })
         await Passkey.deleteMany({ userId: user._id })
         await WebAuthnChallenge.deleteMany({ userId: user._id })
         await LoginThrottle.deleteMany({ key: user.email })
         await sessions.endAllForUser(user._id)
         await deleteAvatar(user.avatarUrl, avatarDir)
         await user.deleteOne()
      },
   }
}

export type AccountService = ReturnType<typeof createAccountService>
