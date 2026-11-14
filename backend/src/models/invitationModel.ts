import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

export const INVITATION_KINDS = ['email', 'user', 'link'] as const
export type InvitationKind = (typeof INVITATION_KINDS)[number]
export const INVITABLE_ROLES = ['admin', 'member'] as const

const invitationSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true, index: true },
      invitedBy: { type: Types.ObjectId, ref: 'User', required: true },
      kind: { type: String, enum: INVITATION_KINDS, required: true },
      role: { type: String, enum: INVITABLE_ROLES, required: true, default: 'member' },
      /** kind 'email': only an account with this (verified) address can accept. */
      email: { type: String, default: null, lowercase: true, trim: true },
      /** kind 'user': the invited account (found by exact @handle). */
      userId: { type: Types.ObjectId, ref: 'User', default: null },
      /** SHA-256 of the link token (kinds 'email' and 'link'); the token itself is never stored. */
      tokenHash: { type: String, default: null },
      /** Optional managed profile the invitee takes over (keeps its membership id). */
      claimsMembershipId: { type: Types.ObjectId, ref: 'Membership', default: null },
      maxUses: { type: Number, default: 1 },
      uses: { type: Number, default: 0 },
      expiresAt: { type: Date, required: true },
      revokedAt: { type: Date, default: null },
      declinedAt: { type: Date, default: null },
      /** Set when single-use invitations are used up. */
      acceptedAt: { type: Date, default: null },
   },
   { timestamps: true },
)

invitationSchema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } })
invitationSchema.index({ email: 1 })
invitationSchema.index({ userId: 1 })

export type InvitationType = HydratedDocument<InferSchemaType<typeof invitationSchema>>
export const Invitation = model('Invitation', invitationSchema)
