import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { REDEMPTION_STATUSES } from '../domain/rewards'

/** Highest price of a reward in points. App choice. */
export const MAX_REWARD_COST = 10_000

/** Something members can spend chore points on ("Choose Friday's movie", 50 points). */
const rewardSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      title: { type: String, required: true, trim: true, maxlength: 80 },
      description: { type: String, trim: true, maxlength: 300, default: '' },
      cost: { type: Number, required: true, min: 1, max: MAX_REWARD_COST },
      /** A manager approves each request (per reward, user decision 2026-11-16). */
      needsApproval: { type: Boolean, default: false },
      archivedAt: { type: Date, default: null },
      createdBy: { type: Types.ObjectId, ref: 'Membership', required: true },
   },
   { timestamps: true },
)
rewardSchema.index({ householdId: 1, archivedAt: 1 })

/** One request to spend points. Title and cost are copied, so later edits don't change history. */
const redemptionSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      rewardId: { type: Types.ObjectId, ref: 'Reward', required: true },
      title: { type: String, required: true },
      cost: { type: Number, required: true },
      /** Whose points are spent. */
      memberId: { type: Types.ObjectId, ref: 'Membership', required: true },
      requestedBy: { type: Types.ObjectId, ref: 'Membership', required: true },
      status: { type: String, enum: REDEMPTION_STATUSES, required: true },
      decidedBy: { type: Types.ObjectId, ref: 'Membership', default: null },
      decidedAt: { type: Date, default: null },
      /** Optional word from the manager (e.g. why it was declined). */
      note: { type: String, trim: true, maxlength: 200, default: '' },
   },
   { timestamps: true },
)
redemptionSchema.index({ householdId: 1, memberId: 1, status: 1 })
redemptionSchema.index({ householdId: 1, createdAt: -1 })
redemptionSchema.index({ rewardId: 1 })

export type RewardType = HydratedDocument<InferSchemaType<typeof rewardSchema>>
export type RedemptionType = HydratedDocument<InferSchemaType<typeof redemptionSchema>>
export const Reward = model('Reward', rewardSchema)
export const Redemption = model('Redemption', redemptionSchema)
