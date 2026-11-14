import { Schema, model } from 'mongoose'

/**
 * Failed-login counter per normalized email. Keyed by the submitted email,
 * so unknown and existing accounts are throttled identically.
 */
const loginThrottleSchema = new Schema({
   key: { type: String, required: true, unique: true },
   failures: { type: Number, required: true, default: 0 },
   lockedUntil: { type: Date, default: null },
   /** Forget the counter a day after the last failure (TTL index). */
   expiresAt: { type: Date, required: true, expires: 0 },
})

export const LoginThrottle = model('LoginThrottle', loginThrottleSchema)
