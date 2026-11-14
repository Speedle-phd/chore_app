import { Schema, model, Types } from 'mongoose'

/** One-time WebAuthn challenge. Consumed on verify; expires after a few minutes. */
const challengeSchema = new Schema({
   challenge: { type: String, required: true },
   purpose: { type: String, enum: ['register', 'login'], required: true },
   /** Set for registration (signed-in user); null for passkey login. */
   userId: { type: Types.ObjectId, ref: 'User', default: null },
   expiresAt: { type: Date, required: true, expires: 0 },
})

export const WebAuthnChallenge = model('WebAuthnChallenge', challengeSchema)
