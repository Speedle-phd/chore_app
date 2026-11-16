import { isValidObjectId, type Types } from 'mongoose'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { deleteAvatar, saveAvatar } from '../media/avatars'
import { Household } from '../models/householdModel'
import { IcalFeed } from '../models/icalFeedModel'
import { Recipe } from '../models/recipeModel'
import { deleteImage, RECIPE_IMAGES } from '../media/images'
import { ItemMemory, ShoppingCategory, ShoppingItem, ShoppingList } from '../models/shoppingModels'
import { CalendarItem } from '../models/calendarItemModel'
import { Invitation } from '../models/invitationModel'
import { Membership, type MembershipType, type Role } from '../models/membershipModel'
import { Occurrence } from '../models/occurrenceModel'
import { Reminder } from '../models/reminderModel'
import { User } from '../models/userModel'
import { realtime } from '../socket/realtime'
import { householdView, memberView } from './householdViews'
import { canChangeRoles, canDeleteHousehold, canManage, canRemove } from './permissions'

type ProfileInput = { fname: string; lname: string; birthday?: string | null | undefined }

/** The caller's own membership (from requireMembership) is passed in as `me`. */
export function createHouseholdService({ avatarDir, recipeDir }: { avatarDir: string; recipeDir: string }) {
   async function findTarget(householdId: Types.ObjectId, memberId: string) {
      const target = isValidObjectId(memberId)
         ? await Membership.findOne({ _id: memberId, householdId })
         : null
      if (!target) throw new NotFoundError('Member not found')
      return target
   }

   const otherOwnerExists = async (householdId: Types.ObjectId, exceptId: Types.ObjectId) =>
      Boolean(await Membership.exists({ householdId, role: 'owner', _id: { $ne: exceptId } }))

   async function detach(target: MembershipType) {
      await target.deleteOne()
      // Their reminders, and others' reminders for their birthday.
      await Reminder.deleteMany({ $or: [{ membershipId: target._id }, { 'target.memberId': target._id }] })
      // Their calendar link stops working.
      await IcalFeed.deleteMany({ membershipId: target._id })
      if (target.profile?.avatarUrl) await deleteAvatar(target.profile.avatarUrl, avatarDir)
      if (target.userId) {
         await User.updateOne(
            { _id: target.userId, lastHouseholdId: target.householdId },
            { $set: { lastHouseholdId: null } },
         )
         // Their open tabs stop receiving this household's events and reload their household list.
         realtime.removeFromHousehold(target.userId, target.householdId)
         realtime.userChanged(target.userId, 'households')
      }
   }

   /** Accounts in a household (for notices that also matter outside its room, e.g. the switcher). */
   const accountIds = async (householdId: Types.ObjectId) =>
      (await Membership.find({ householdId, userId: { $type: 'objectId' } }).select('userId').lean()).flatMap((m) =>
         m.userId ? [m.userId] : [],
      )

   async function view(householdId: Types.ObjectId, role: Role) {
      const household = await Household.findById(householdId)
      if (!household) throw new NotFoundError('Household not found')
      return householdView(household, role, await Membership.countDocuments({ householdId }))
   }

   return {
      async listMine(userId: Types.ObjectId) {
         const memberships = await Membership.find({ userId }).lean()
         const ids = memberships.map((m) => m.householdId)
         const [households, counts] = await Promise.all([
            Household.find({ _id: { $in: ids } }).sort({ name: 1 }),
            Membership.aggregate<{ _id: Types.ObjectId; count: number }>([
               { $match: { householdId: { $in: ids } } },
               { $group: { _id: '$householdId', count: { $sum: 1 } } },
            ]),
         ])
         const roleOf = new Map(memberships.map((m) => [m.householdId.toString(), m.role]))
         const countOf = new Map(counts.map((c) => [c._id.toString(), c.count]))
         return households.map((h) =>
            householdView(h, roleOf.get(h.id) ?? 'member', countOf.get(h.id) ?? 0),
         )
      },

      async create(userId: Types.ObjectId, name: string) {
         const household = await Household.create({ name, createdBy: userId })
         await Membership.create({ householdId: household._id, userId, role: 'owner' })
         await User.updateOne({ _id: userId }, { $set: { lastHouseholdId: household._id } })
         return householdView(household, 'owner', 1)
      },

      get: (me: MembershipType) => view(me.householdId, me.role),

      async select(me: MembershipType) {
         await User.updateOne({ _id: me.userId }, { $set: { lastHouseholdId: me.householdId } })
      },

      async rename(me: MembershipType, name: string) {
         if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can rename the household.')
         await Household.updateOne({ _id: me.householdId }, { $set: { name } })
         realtime.householdChanged(me.householdId, 'household')
         realtime.userChanged(await accountIds(me.householdId), 'households')
         return view(me.householdId, me.role)
      },

      /** Switch the leaderboard, badges or streaks on or off (owners and admins). */
      async setMotivation(me: MembershipType, input: { leaderboard?: boolean | undefined; badges?: boolean | undefined; streaks?: boolean | undefined }) {
         if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can change this.')
         const set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined).map(([k, v]) => [`motivation.${k}`, v]))
         await Household.updateOne({ _id: me.householdId }, { $set: set })
         realtime.householdChanged(me.householdId, 'household')
         realtime.userChanged(await accountIds(me.householdId), 'households')
         return view(me.householdId, me.role)
      },

      async remove(me: MembershipType) {
         if (!canDeleteHousehold(me.role)) throw new ForbiddenError('Only owners can delete the household.')
         const members = await Membership.find({ householdId: me.householdId })
         for (const member of members) await detach(member)
         await Invitation.deleteMany({ householdId: me.householdId })
         await Occurrence.deleteMany({ householdId: me.householdId })
         await CalendarItem.deleteMany({ householdId: me.householdId })
         await Reminder.deleteMany({ householdId: me.householdId })
         await IcalFeed.deleteMany({ householdId: me.householdId })
         const recipes = await Recipe.find({ householdId: me.householdId }).select('imageUrl').lean()
         for (const r of recipes) await deleteImage(r.imageUrl, recipeDir, RECIPE_IMAGES)
         await Recipe.deleteMany({ householdId: me.householdId })
         for (const Model of [ShoppingItem, ShoppingList, ShoppingCategory, ItemMemory] as const) {
            await (Model as typeof ShoppingItem).deleteMany({ householdId: me.householdId })
         }
         await Household.deleteOne({ _id: me.householdId })
      },

      async listMembers(me: MembershipType) {
         const memberships = await Membership.find({ householdId: me.householdId }).sort({ createdAt: 1 })
         const userIds = memberships.flatMap((m) => (m.userId ? [m.userId] : []))
         const users = await User.find({ _id: { $in: userIds } }).select('fname lname email avatarUrl birthday').lean()
         const userOf = new Map(users.map((u) => [u._id.toString(), u]))
         const meId = me.userId as Types.ObjectId
         return memberships.map((m) => memberView(m, m.userId ? (userOf.get(m.userId.toString()) ?? null) : null, meId))
      },

      async createProfile(me: MembershipType, input: ProfileInput, avatar?: Buffer) {
         if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can add profiles.')
         const avatarUrl = avatar ? await saveAvatar(avatar, avatarDir) : null
         try {
            const profile = await Membership.create({
               householdId: me.householdId,
               role: 'member',
               profile: { ...input, birthday: input.birthday ?? null, avatarUrl },
            })
            realtime.householdChanged(me.householdId, 'members', 'calendar')
            return memberView(profile, null, me.userId as Types.ObjectId)
         } catch (error) {
            await deleteAvatar(avatarUrl, avatarDir)
            throw error
         }
      },

      async updateProfile(me: MembershipType, memberId: string, input: ProfileInput, avatar?: Buffer) {
         if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can edit profiles.')
         const target = await findTarget(me.householdId, memberId)
         if (!target.profile) throw new BadRequestError('Only profiles without a login can be edited here.')

         const previousAvatar = target.profile.avatarUrl ?? null
         const avatarUrl = avatar ? await saveAvatar(avatar, avatarDir) : previousAvatar
         target.profile = { ...input, birthday: input.birthday ?? null, avatarUrl }
         try {
            await target.save()
         } catch (error) {
            if (avatar) await deleteAvatar(avatarUrl, avatarDir)
            throw error
         }
         // Replaced pictures are deleted, so no orphaned files pile up.
         if (avatar) await deleteAvatar(previousAvatar, avatarDir)
         realtime.householdChanged(me.householdId, 'members')
         return memberView(target, null, me.userId as Types.ObjectId)
      },

      async changeRole(me: MembershipType, memberId: string, role: Role) {
         if (!canChangeRoles(me.role)) throw new ForbiddenError('Only owners can change roles.')
         const target = await findTarget(me.householdId, memberId)
         if (!target.userId) throw new BadRequestError('Profiles without a login are always members.')
         if (target.role === 'owner' && role !== 'owner' && !(await otherOwnerExists(me.householdId, target._id))) {
            throw new ConflictError('A household needs at least one owner. Make someone else owner first.')
         }
         target.role = role
         await target.save()
         realtime.householdChanged(me.householdId, 'members')
         realtime.userChanged(target.userId, 'households') // their role shows in the switcher
      },

      async removeMember(me: MembershipType, memberId: string) {
         const target = await findTarget(me.householdId, memberId)
         if (target._id.equals(me._id)) throw new BadRequestError('To remove yourself, leave the household.')
         if (!canRemove(me.role, target.role)) throw new ForbiddenError('You can’t remove this member.')
         if (target.role === 'owner' && !(await otherOwnerExists(me.householdId, target._id))) {
            throw new ConflictError('A household needs at least one owner.')
         }
         await detach(target)
         realtime.householdChanged(me.householdId, 'members')
      },

      async leave(me: MembershipType) {
         if (me.role === 'owner' && !(await otherOwnerExists(me.householdId, me._id))) {
            const othersWithLogin = await Membership.exists({
               householdId: me.householdId,
               _id: { $ne: me._id },
               userId: { $type: 'objectId' },
            })
            throw new ConflictError(
               othersWithLogin
                  ? 'You’re the only owner. Make someone else owner before you leave.'
                  : 'You’re the only member with a login. Delete the household instead.',
            )
         }
         await detach(me)
         realtime.householdChanged(me.householdId, 'members')
      },
   }
}

export type HouseholdService = ReturnType<typeof createHouseholdService>
