import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

export const FEED_SCOPES = ['all', 'mine'] as const
export type FeedScope = (typeof FEED_SCOPES)[number]

/**
 * A member's private calendar subscription link (iCal feed) for one household.
 * Only the token's hash is stored; the link is shown once when it is created.
 * One per membership, so leaving the household ends it.
 */
const icalFeedSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      membershipId: { type: Types.ObjectId, ref: 'Membership', required: true },
      tokenHash: { type: String, required: true },
      /** When the current link was made (replacing it resets this). */
      issuedAt: { type: Date, required: true },
      /** `all`: the household's calendar; `mine`: only entries for this member. */
      scope: { type: String, enum: FEED_SCOPES, default: 'all' },
      lastUsedAt: { type: Date, default: null },
   },
   { timestamps: true },
)

icalFeedSchema.index({ membershipId: 1 }, { unique: true })
icalFeedSchema.index({ tokenHash: 1 }, { unique: true })
icalFeedSchema.index({ householdId: 1 })

export type IcalFeedType = HydratedDocument<InferSchemaType<typeof icalFeedSchema>>
export const IcalFeed = model('IcalFeed', icalFeedSchema)
