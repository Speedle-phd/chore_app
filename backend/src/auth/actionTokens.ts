import type { Types } from 'mongoose'
import { ActionToken, type ActionPurpose } from '../models/actionTokenModel'
import { randomToken, sha256 } from './crypto'

const LIFETIME_MS: Record<ActionPurpose, number> = {
   verify_email: 24 * 60 * 60_000,
   reset_password: 30 * 60_000,
}
/** Minimum gap between two emails of the same kind to one user (anti mail-bombing). */
const RESEND_COOLDOWN_MS = 60_000

/**
 * Issues a single-use token and invalidates older unused ones of the same
 * purpose. Returns null when one was issued very recently (caller stays silent).
 */
export async function issueActionToken(
   userId: Types.ObjectId,
   purpose: ActionPurpose,
   now: Date,
): Promise<string | null> {
   const recent = await ActionToken.exists({
      userId,
      purpose,
      usedAt: null,
      createdAt: { $gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) },
   })
   if (recent) return null

   await ActionToken.updateMany(
      { userId, purpose, usedAt: null },
      { $set: { usedAt: now } },
   )
   const token = randomToken()
   await ActionToken.create({
      purpose,
      userId,
      tokenHash: sha256(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + LIFETIME_MS[purpose]),
   })
   return token
}

/** Returns the user id of a still-valid token without using it up. */
export async function peekActionToken(
   token: string,
   purpose: ActionPurpose,
   now: Date,
): Promise<Types.ObjectId | null> {
   const found = await ActionToken.findOne({
      tokenHash: sha256(token),
      purpose,
      usedAt: null,
      expiresAt: { $gt: now },
   }).lean()
   return found?.userId ?? null
}

/**
 * Atomically marks a valid token as used and returns its user id, or null if
 * the token is unknown, expired, already used or for another purpose.
 */
export async function consumeActionToken(
   token: string,
   purpose: ActionPurpose,
   now: Date,
): Promise<Types.ObjectId | null> {
   const used = await ActionToken.findOneAndUpdate(
      {
         tokenHash: sha256(token),
         purpose,
         usedAt: null,
         expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
   )
   return used?.userId ?? null
}
