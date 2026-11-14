import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

const sessionSchema = new Schema({
   /** SHA-256 of the cookie value; the raw session id is never stored. */
   idHash: { type: String, required: true, unique: true },
   userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
   createdAt: { type: Date, required: true },
   lastSeenAt: { type: Date, required: true },
   /** Absolute expiry; MongoDB removes the document afterwards (TTL index). */
   expiresAt: { type: Date, required: true, expires: 0 },
   userAgent: { type: String, default: null },
   ip: { type: String, default: null },
})

export type SessionType = HydratedDocument<InferSchemaType<typeof sessionSchema>>
export const Session = model('Session', sessionSchema)
