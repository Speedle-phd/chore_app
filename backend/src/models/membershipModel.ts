import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

export const ROLES = ['owner', 'admin', 'member'] as const
export type Role = (typeof ROLES)[number]

/**
 * A person in a household: either an account (`userId`) or a managed profile
 * without login (`profile`). Chores will reference membership ids, so history
 * survives when a profile is later claimed by an account.
 */
const membershipSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      userId: { type: Types.ObjectId, ref: 'User', default: null },
      role: { type: String, enum: ROLES, required: true, default: 'member' },
      profile: {
         type: new Schema(
            {
               fname: { type: String, required: true, trim: true, maxlength: 50 },
               lname: { type: String, required: true, trim: true, maxlength: 50 },
               avatarUrl: { type: String, default: null },
            },
            { _id: false },
         ),
         default: null,
      },
   },
   { timestamps: true },
)

membershipSchema.index({ householdId: 1 })
// One membership per account per household; profiles (userId null) are exempt.
membershipSchema.index(
   { householdId: 1, userId: 1 },
   { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
)
membershipSchema.index({ userId: 1 })

export type MembershipType = HydratedDocument<InferSchemaType<typeof membershipSchema>>
export const Membership = model('Membership', membershipSchema)
