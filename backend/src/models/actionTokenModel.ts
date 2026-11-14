import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

export const ACTION_PURPOSES = ['verify_email', 'reset_password'] as const
export type ActionPurpose = (typeof ACTION_PURPOSES)[number]

const actionTokenSchema = new Schema({
   purpose: { type: String, enum: ACTION_PURPOSES, required: true },
   userId: { type: Types.ObjectId, ref: 'User', required: true },
   /** SHA-256 of the emailed token. */
   tokenHash: { type: String, required: true, unique: true },
   createdAt: { type: Date, required: true },
   expiresAt: { type: Date, required: true, expires: 0 },
   usedAt: { type: Date, default: null },
})
actionTokenSchema.index({ userId: 1, purpose: 1 })

export type ActionTokenType = HydratedDocument<
   InferSchemaType<typeof actionTokenSchema>
>
export const ActionToken = model('ActionToken', actionTokenSchema)
