import { isValidObjectId, type Types } from 'mongoose'
import { randomToken, sha256 } from '../auth/crypto'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { householdView } from '../households/householdViews'
import { canManage } from '../households/permissions'
import type { SendMail } from '../mail/mailer'
import { deleteAvatar } from '../media/avatars'
import { Household } from '../models/householdModel'
import { Invitation, type InvitationType } from '../models/invitationModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { User, type UserType } from '../models/userModel'
import { realtime } from '../socket/realtime'

const LIFETIME_MS = 7 * 24 * 60 * 60_000

export type CreateInvitation =
   | { kind: 'email'; email: string; role: 'admin' | 'member'; claimsMembershipId?: string | undefined }
   | { kind: 'user'; userId: string; role: 'admin' | 'member'; claimsMembershipId?: string | undefined }
   | { kind: 'link'; role: 'admin' | 'member'; maxUses: number }

type Deps = { sendMail: SendMail; appUrl: string; avatarDir: string }

const INVALID = 'This invitation is invalid, expired or was already used.'
const invalid = () => new NotFoundError(INVALID)

/** Still usable: not revoked, declined, used up or expired. */
const activeFilter = (now: Date) => ({
   revokedAt: null,
   declinedAt: null,
   acceptedAt: null,
   expiresAt: { $gt: now },
   $expr: { $lt: ['$uses', '$maxUses'] },
})

/** a••••@example.com: enough to recognise your own address, not to harvest it. */
export const maskEmail = (email: string) => {
   const [local = '', domain = ''] = email.split('@')
   return `${local.slice(0, 1)}${'•'.repeat(Math.max(local.length - 1, 1))}@${domain}`
}

export function createInvitationService({ sendMail, appUrl, avatarDir }: Deps) {
   const url = (path: string, token?: string) => {
      const u = new URL(path, appUrl)
      if (token) u.searchParams.set('token', token)
      return u.toString()
   }

   async function namesOf(inv: InvitationType) {
      const [household, inviter, claims] = await Promise.all([
         Household.findById(inv.householdId).lean(),
         User.findById(inv.invitedBy).select('fname lname').lean(),
         inv.claimsMembershipId ? Membership.findById(inv.claimsMembershipId).lean() : null,
      ])
      return {
         household: household?.name ?? 'a household',
         inviter: inviter ? `${inviter.fname} ${inviter.lname}`.trim() : 'Someone',
         claims: claims?.profile ? `${claims.profile.fname} ${claims.profile.lname}`.trim() : null,
      }
   }

   async function notify(inv: InvitationType, to: string, link: string): Promise<boolean> {
      const names = await namesOf(inv)
      try {
         await sendMail('invitation', to, {
            inviter: names.inviter,
            household: names.household,
            link,
            role: inv.role,
            claims: names.claims ?? '',
         })
         return true
      } catch (error) {
         console.error('Invitation email not sent:', (error as Error).message)
         return false
      }
   }

   /** After any change to an invitation: refresh the household's pending list and the invitee's inbox. */
   async function invitationChanged(inv: InvitationType) {
      realtime.householdChanged(inv.householdId, 'invitations')
      const invitee = inv.userId ?? (inv.email ? (await User.findOne({ email: inv.email }).select('_id').lean())?._id : null)
      if (invitee) realtime.userChanged(invitee, 'invitations')
   }

   async function isMember(householdId: Types.ObjectId, userId: Types.ObjectId) {
      return Boolean(await Membership.exists({ householdId, userId }))
   }

   /** Admin-facing view of a pending invitation. Never contains the token. */
   async function adminView(inv: InvitationType) {
      const [user, claims] = await Promise.all([
         inv.userId ? User.findById(inv.userId).select('fname lname handle').lean() : null,
         inv.claimsMembershipId ? Membership.findById(inv.claimsMembershipId).lean() : null,
      ])
      return {
         id: inv._id.toString(),
         kind: inv.kind,
         role: inv.role,
         email: inv.email,
         user: user ? { fullName: `${user.fname} ${user.lname}`.trim(), handle: user.handle } : null,
         claims: claims?.profile
            ? { id: claims._id.toString(), fullName: `${claims.profile.fname} ${claims.profile.lname}`.trim() }
            : null,
         uses: inv.uses,
         maxUses: inv.maxUses,
         expiresAt: inv.expiresAt.toISOString(),
         createdAt: inv.createdAt.toISOString(),
      }
   }

   /** Invitee-facing view. */
   async function inviteeView(inv: InvitationType) {
      const names = await namesOf(inv)
      return {
         id: inv._id.toString(),
         kind: inv.kind,
         role: inv.role,
         household: names.household,
         inviter: names.inviter,
         claims: names.claims,
         emailHint: inv.email ? maskEmail(inv.email) : null,
         expiresAt: inv.expiresAt.toISOString(),
      }
   }

   /** Joins the household (or takes over the claimed profile) and uses up the invitation. */
   async function join(inv: InvitationType, user: UserType, now: Date) {
      if (await isMember(inv.householdId, user._id)) {
         throw new ConflictError('You’re already a member of this household.')
      }
      // Atomic use: two people can't both take the last use of a link.
      const used = await Invitation.findOneAndUpdate(
         { _id: inv._id, ...activeFilter(now) },
         inv.kind === 'link' ? { $inc: { uses: 1 } } : { $inc: { uses: 1 }, $set: { acceptedAt: now } },
         { returnDocument: 'after' },
      )
      if (!used) throw invalid()

      let membership: MembershipType | null = null
      if (inv.claimsMembershipId) {
         membership = await Membership.findOne({ _id: inv.claimsMembershipId, householdId: inv.householdId, userId: null })
      }
      try {
         if (membership) {
            const avatar = membership.profile?.avatarUrl
            membership.userId = user._id
            membership.role = inv.role
            membership.profile = null
            await membership.save()
            await deleteAvatar(avatar, avatarDir)
         } else {
            membership = await Membership.create({ householdId: inv.householdId, userId: user._id, role: inv.role })
         }
      } catch (error) {
         if ((error as { code?: number }).code === 11000) {
            throw new ConflictError('You’re already a member of this household.')
         }
         throw error
      }
      await User.updateOne({ _id: user._id }, { $set: { lastHouseholdId: inv.householdId } })
      realtime.householdChanged(inv.householdId, 'members', 'invitations', 'household')
      realtime.userChanged(user._id, 'households', 'invitations')

      const household = await Household.findById(inv.householdId)
      if (!household) throw invalid()
      return householdView(household, membership.role, await Membership.countDocuments({ householdId: inv.householdId }))
   }

   /** An email or handle invitation addressed to this user, by id. */
   async function findAddressedTo(user: UserType, id: string, now: Date) {
      if (!isValidObjectId(id)) throw invalid()
      const inv = await Invitation.findOne({
         _id: id,
         ...activeFilter(now),
         $or: [{ kind: 'user', userId: user._id }, { kind: 'email', email: user.email }],
      })
      if (!inv) throw invalid()
      return inv
   }

   async function loadUser(userId: Types.ObjectId) {
      const user = await User.findById(userId)
      if (!user) throw new NotFoundError('Account not found')
      return user
   }

   return {
      async create(me: MembershipType, input: CreateInvitation, now: Date) {
         if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can invite people.')
         if (input.role === 'admin' && me.role !== 'owner') {
            throw new ForbiddenError('Only owners can invite admins.')
         }

         let claimsMembershipId: Types.ObjectId | null = null
         if (input.kind !== 'link' && input.claimsMembershipId) {
            const profile = isValidObjectId(input.claimsMembershipId)
               ? await Membership.findOne({ _id: input.claimsMembershipId, householdId: me.householdId, userId: null })
               : null
            if (!profile) throw new BadRequestError('That profile doesn’t exist in this household.')
            claimsMembershipId = profile._id
         }

         // requireMembership loads the caller by userId, so it's always an account membership.
         const inviterId = me.userId
         if (!inviterId) throw new ForbiddenError('Only members with a login can invite people.')
         const pending = { householdId: me.householdId, ...activeFilter(now) }
         const base = {
            householdId: me.householdId,
            invitedBy: inviterId,
            role: input.role,
            claimsMembershipId,
            expiresAt: new Date(now.getTime() + LIFETIME_MS),
         }

         if (input.kind === 'email') {
            const members = await Membership.find({ householdId: me.householdId, userId: { $ne: null } }).select('userId')
            if (await User.exists({ _id: { $in: members.map((m) => m.userId) }, email: input.email })) {
               throw new ConflictError('That person is already a member of this household.')
            }
            if (await Invitation.exists({ ...pending, kind: 'email', email: input.email })) {
               throw new ConflictError('That address already has a pending invitation. You can resend it.')
            }
            const token = randomToken()
            const inv = await Invitation.create({ ...base, kind: 'email', email: input.email, tokenHash: sha256(token) })
            await invitationChanged(inv)
            const emailSent = await notify(inv, input.email, url('/invite', token))
            return { invitation: await adminView(inv), emailSent }
         }

         if (input.kind === 'user') {
            // Only accounts that opted in to being found can be invited by id.
            const target = isValidObjectId(input.userId)
               ? await User.findOne({ _id: input.userId, findableByHandle: true })
               : null
            if (!target) throw new NotFoundError('No one with that handle can be found.')
            if (await isMember(me.householdId, target._id)) {
               throw new ConflictError('That person is already a member of this household.')
            }
            if (await Invitation.exists({ ...pending, kind: 'user', userId: target._id })) {
               throw new ConflictError('That person already has a pending invitation.')
            }
            const inv = await Invitation.create({ ...base, kind: 'user', userId: target._id })
            await invitationChanged(inv)
            const emailSent = await notify(inv, target.email, url('/invitations'))
            return { invitation: await adminView(inv), emailSent }
         }

         const token = randomToken()
         const inv = await Invitation.create({ ...base, kind: 'link', maxUses: input.maxUses, tokenHash: sha256(token) })
         realtime.householdChanged(me.householdId, 'invitations')
         // The link is shown once; only its hash is stored.
         return { invitation: await adminView(inv), url: url('/invite', token) }
      },

      async list(me: MembershipType, now: Date) {
         if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can see invitations.')
         const invs = await Invitation.find({ householdId: me.householdId, ...activeFilter(now) }).sort({ createdAt: -1 })
         return Promise.all(invs.map(adminView))
      },

      async revoke(me: MembershipType, id: string, now: Date) {
         if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can revoke invitations.')
         const inv = isValidObjectId(id)
            ? await Invitation.findOneAndUpdate(
                 { _id: id, householdId: me.householdId, revokedAt: null },
                 { $set: { revokedAt: now } },
              )
            : null
         if (!inv) throw new NotFoundError('Invitation not found')
         await invitationChanged(inv)
      },

      async resend(me: MembershipType, id: string, now: Date) {
         if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can resend invitations.')
         const inv = isValidObjectId(id)
            ? await Invitation.findOne({ _id: id, householdId: me.householdId, kind: 'email', ...activeFilter(now) })
            : null
         if (!inv?.email) throw new NotFoundError('Invitation not found')
         // A fresh token invalidates the previously emailed link.
         const token = randomToken()
         inv.tokenHash = sha256(token)
         inv.expiresAt = new Date(now.getTime() + LIFETIME_MS)
         await inv.save()
         realtime.householdChanged(me.householdId, 'invitations')
         return { invitation: await adminView(inv), emailSent: await notify(inv, inv.email, url('/invite', token)) }
      },

      async preview(token: string, now: Date) {
         const inv = await Invitation.findOne({ tokenHash: sha256(token), ...activeFilter(now) })
         if (!inv) throw invalid()
         return inviteeView(inv)
      },

      async acceptByToken(userId: Types.ObjectId, token: string, now: Date) {
         const user = await loadUser(userId)
         const inv = await Invitation.findOne({ tokenHash: sha256(token), ...activeFilter(now) })
         if (!inv) throw invalid()
         if (inv.kind === 'email' && inv.email !== user.email) {
            throw new ForbiddenError(
               `This invitation was sent to ${maskEmail(inv.email ?? '')}. Sign in with that address to accept it.`,
               'WRONG_ACCOUNT',
            )
         }
         return join(inv, user, now)
      },

      async mine(userId: Types.ObjectId, now: Date) {
         const user = await loadUser(userId)
         const memberOf = (await Membership.find({ userId: user._id }).select('householdId')).map((m) => m.householdId)
         const invs = await Invitation.find({
            ...activeFilter(now),
            householdId: { $nin: memberOf },
            $or: [{ kind: 'user', userId: user._id }, { kind: 'email', email: user.email }],
         }).sort({ createdAt: -1 })
         return Promise.all(invs.map(inviteeView))
      },

      async acceptById(userId: Types.ObjectId, id: string, now: Date) {
         const user = await loadUser(userId)
         return join(await findAddressedTo(user, id, now), user, now)
      },

      async decline(userId: Types.ObjectId, id: string, now: Date) {
         const user = await loadUser(userId)
         const inv = await findAddressedTo(user, id, now)
         inv.declinedAt = now
         await inv.save()
         await invitationChanged(inv)
      },
   }
}

export type InvitationService = ReturnType<typeof createInvitationService>
