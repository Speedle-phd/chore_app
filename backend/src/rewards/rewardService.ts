import { isValidObjectId, Types } from 'mongoose'
import type { StatsService } from '../calendar/statsService'
import { balance, initialStatus, nextStatus, type Balance, type RedemptionAction } from '../domain/rewards'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { canManage, canRedeemFor } from '../households/permissions'
import { Household } from '../models/householdModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { Redemption, Reward } from '../models/rewardModels'
import { realtime } from '../socket/realtime'
import type { RewardInput, RewardUpdate } from './rewardSchemas'
import { redemptionView, rewardView } from './rewardViews'

/** Latest decided requests shown in the history. App choice. */
const HISTORY = 30
/** Latest requests on a member overview. App choice. */
const MEMBER_RECENT = 10
const ACTIVE = ['pending', 'approved'] as const

export function createRewardService({ stats }: { stats: StatsService }) {
   const changed = (me: MembershipType) => realtime.householdChanged(me.householdId, 'rewards')
   const sameId = (a: Types.ObjectId | string, b: Types.ObjectId | string) => a.toString() === b.toString()

   function assertManager(me: MembershipType) {
      if (!canManage(me.role)) throw new ForbiddenError('Only owners and admins can change rewards.')
   }

   async function enabled(me: MembershipType) {
      const household = await Household.findById(me.householdId).select('motivation').lean()
      return household?.motivation?.rewards ?? true
   }

   async function findReward(me: MembershipType, id: string) {
      const reward = isValidObjectId(id) ? await Reward.findOne({ _id: id, householdId: me.householdId }) : null
      if (!reward) throw new NotFoundError('Reward not found')
      return reward
   }

   /** A request the caller may see: managers all, others only their own (or ones they made). */
   async function findRedemption(me: MembershipType, id: string) {
      const r = isValidObjectId(id) ? await Redemption.findOne({ _id: id, householdId: me.householdId }) : null
      if (!r || !(canManage(me.role) || sameId(r.memberId, me._id) || sameId(r.requestedBy, me._id))) {
         throw new NotFoundError('Request not found')
      }
      return r
   }

   /** Balances for these members: points ever earned minus approved and pending requests. */
   async function balances(me: MembershipType, memberIds: string[], now: Date): Promise<Record<string, Balance>> {
      const [earned, active] = await Promise.all([
         stats.earned(me, memberIds, now),
         Redemption.find({ householdId: me.householdId, memberId: { $in: memberIds }, status: { $in: ACTIVE } })
            .select('memberId cost status')
            .lean(),
      ])
      return Object.fromEntries(
         memberIds.map((id) => [id, balance(earned.get(id) ?? 0, active.filter((r) => sameId(r.memberId, id)))]),
      )
   }

   return {
      /** Everything the Rewards tab needs, scoped to what the caller may see. */
      async overview(me: MembershipType, now: Date) {
         const manager = canManage(me.role)
         const mine = { householdId: me.householdId, $or: [{ memberId: me._id }, { requestedBy: me._id }] }
         const scope = manager ? { householdId: me.householdId } : mine
         const memberIds = manager
            ? (await Membership.find({ householdId: me.householdId }).select('_id').lean()).map((m) => m._id.toString())
            : [me._id.toString()]
         const [isEnabled, rewards, archived, pending, history, balanceMap] = await Promise.all([
            enabled(me),
            Reward.find({ householdId: me.householdId, archivedAt: null }).sort({ cost: 1, title: 1 }).lean(),
            manager ? Reward.find({ householdId: me.householdId, archivedAt: { $ne: null } }).sort({ title: 1 }).lean() : [],
            Redemption.find({ ...scope, status: 'pending' }).sort({ createdAt: 1 }).lean(),
            Redemption.find({ ...scope, status: { $ne: 'pending' } }).sort({ createdAt: -1 }).limit(HISTORY).lean(),
            balances(me, memberIds, now),
         ])
         return {
            enabled: isEnabled,
            rewards: rewards.map(rewardView),
            archived: archived.map(rewardView),
            balances: balanceMap,
            pending: pending.map(redemptionView),
            history: history.map(redemptionView),
         }
      },

      /** One member's balance and latest requests (themselves, or managers). */
      async member(me: MembershipType, memberId: string, now: Date) {
         if (!sameId(memberId, me._id) && !canManage(me.role)) throw new ForbiddenError('Only owners and admins can see other people’s points.')
         const member = await Membership.exists({ _id: memberId, householdId: me.householdId })
         if (!member) throw new NotFoundError('Member not found')
         const [balanceMap, recent] = await Promise.all([
            balances(me, [memberId], now),
            Redemption.find({ householdId: me.householdId, memberId }).sort({ createdAt: -1 }).limit(MEMBER_RECENT).lean(),
         ])
         return { balance: balanceMap[memberId] as Balance, recent: recent.map(redemptionView) }
      },

      async create(me: MembershipType, input: RewardInput) {
         assertManager(me)
         const reward = await Reward.create({ ...input, householdId: me.householdId, createdBy: me._id })
         changed(me)
         return rewardView(reward)
      },

      /** Editing doesn't touch earlier requests: they keep the title and cost they had. */
      async update(me: MembershipType, id: string, input: RewardUpdate) {
         assertManager(me)
         const reward = await findReward(me, id)
         reward.set(input)
         await reward.save()
         changed(me)
         return rewardView(reward)
      },

      async archive(me: MembershipType, id: string, archived: boolean) {
         assertManager(me)
         const reward = await findReward(me, id)
         reward.archivedAt = archived ? (reward.archivedAt ?? new Date()) : null
         await reward.save()
         changed(me)
         return rewardView(reward)
      },

      /** Only rewards nobody has asked for yet; used ones are archived instead (their history stays). */
      async remove(me: MembershipType, id: string) {
         assertManager(me)
         const reward = await findReward(me, id)
         if (await Redemption.exists({ rewardId: reward._id })) {
            throw new ConflictError('Someone has already asked for this reward. Archive it instead.')
         }
         await reward.deleteOne()
         changed(me)
      },

      /**
       * Spend points on a reward. No transactions (single-node Mongo): the request is inserted,
       * then the member's active requests are walked in insertion order; if the points don't cover
       * everything up to this one, it is removed again. Two requests at the same moment see the
       * same order, so the earlier one stays and the later one gets the 409.
       */
      async redeem(me: MembershipType, rewardId: string, memberId: string | undefined, now: Date) {
         if (!(await enabled(me))) throw new ConflictError('Rewards are switched off in this household.')
         const reward = await findReward(me, rewardId)
         if (reward.archivedAt) throw new ConflictError('This reward is no longer offered.')
         const targetId = memberId ?? me._id.toString()
         const target = isValidObjectId(targetId)
            ? await Membership.findOne({ _id: targetId, householdId: me.householdId }).select('userId').lean()
            : null
         if (!target) throw new BadRequestError('Pick someone of this household.')
         const isSelf = sameId(target._id, me._id)
         if (!canRedeemFor(me.role, isSelf, Boolean(target.userId))) {
            throw new ForbiddenError(target.userId ? 'You can only spend your own points.' : 'Only owners and admins can spend a profile’s points.')
         }

         const before = (await balances(me, [targetId], now))[targetId] as Balance
         if (before.available < reward.cost) {
            throw new ConflictError(`Not enough points: ${Math.max(before.available, 0)} of ${reward.cost}.`)
         }
         const status = initialStatus(reward.needsApproval, canManage(me.role))
         const created = await Redemption.create({
            householdId: me.householdId,
            rewardId: reward._id,
            title: reward.title,
            cost: reward.cost,
            memberId: target._id,
            requestedBy: me._id,
            status,
            decidedAt: status === 'approved' ? now : null,
         })

         const earned = (await stats.earned(me, [targetId], now)).get(targetId) ?? 0
         const active = await Redemption.find({ householdId: me.householdId, memberId: target._id, status: { $in: ACTIVE } })
            .sort({ _id: 1 })
            .select('_id cost')
            .lean()
         let used = 0
         for (const r of active) {
            used += r.cost
            if (sameId(r._id, created._id)) break
         }
         if (used > earned) {
            await created.deleteOne()
            throw new ConflictError('Not enough points left: another request was just made.')
         }
         changed(me)
         return redemptionView(created)
      },

      /** Approve, decline or refund (managers); cancel (whoever it concerns, or managers). */
      async decide(me: MembershipType, id: string, action: RedemptionAction, note: string, now: Date) {
         const r = await findRedemption(me, id)
         const involved = sameId(r.memberId, me._id) || sameId(r.requestedBy, me._id)
         if (action === 'cancel' ? !(involved || canManage(me.role)) : !canManage(me.role)) {
            throw new ForbiddenError('Only owners and admins can decide on requests.')
         }
         const next = nextStatus(r.status, action)
         if (!next) throw new ConflictError(`This request is already ${r.status}.`)
         // Only from the state we read, so two managers can't both decide.
         const updated = await Redemption.findOneAndUpdate(
            { _id: r._id, status: r.status },
            { $set: { status: next, decidedBy: me._id, decidedAt: now, note } },
            { new: true },
         ).lean()
         if (!updated) throw new ConflictError('Someone else just changed this request.')
         changed(me)
         return redemptionView(updated)
      },
   }
}

export type RewardService = ReturnType<typeof createRewardService>
