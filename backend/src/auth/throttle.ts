import { LoginThrottle } from '../models/loginThrottleModel'

export const FREE_ATTEMPTS = 5
const BASE_LOCK_MS = 30_000
const MAX_LOCK_MS = 15 * 60_000
const FORGET_AFTER_MS = 24 * 60 * 60_000

/**
 * Lock duration after `failures` consecutive failed logins: free attempts
 * first, then a growing delay (30 s, 1 min, 2 min, …) capped at 15 min. Never
 * a permanent lockout, which would let anyone block an account.
 */
export function lockDurationMs(failures: number): number {
   if (failures < FREE_ATTEMPTS) return 0
   return Math.min(BASE_LOCK_MS * 2 ** (failures - FREE_ATTEMPTS), MAX_LOCK_MS)
}

/** Seconds until the next attempt is allowed, or 0. */
export async function lockedForSeconds(key: string, now: Date): Promise<number> {
   const entry = await LoginThrottle.findOne({ key }).lean()
   if (!entry?.lockedUntil || entry.lockedUntil <= now) return 0
   return Math.ceil((entry.lockedUntil.getTime() - now.getTime()) / 1000)
}

export async function recordFailure(key: string, now: Date): Promise<void> {
   // Atomic increment, then derive the lock from the stored count.
   const entry = await LoginThrottle.findOneAndUpdate(
      { key },
      {
         $inc: { failures: 1 },
         $set: { expiresAt: new Date(now.getTime() + FORGET_AFTER_MS) },
      },
      { upsert: true, returnDocument: 'after' },
   )
   const lockMs = lockDurationMs(entry.failures)
   if (lockMs > 0) {
      await LoginThrottle.updateOne(
         { key },
         { $set: { lockedUntil: new Date(now.getTime() + lockMs) } },
      )
   }
}

export const clearFailures = (key: string) => LoginThrottle.deleteOne({ key })
