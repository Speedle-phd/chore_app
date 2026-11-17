/**
 * Rewards for chore points (docs/plans/rewards-pinboard-guest.md, phase 2). Pure.
 *
 * User decisions (2026-11-16): approval is set per reward; spendable points never expire,
 * so the balance is all points ever earned minus what was spent.
 * App choices: points of a request waiting for approval are reserved (not spendable twice);
 * declined, cancelled and refunded requests give their points back. Earned points are derived
 * from chore history, so the balance can drop below zero when a done chore is undone after
 * spending; that blocks new requests but takes nothing back.
 */

export const REDEMPTION_STATUSES = ['pending', 'approved', 'declined', 'cancelled', 'refunded'] as const
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number]

export type RedemptionAction = 'approve' | 'decline' | 'cancel' | 'refund'

export type Balance = {
   /** All points ever earned with chores. */
   earned: number
   /** Points of approved rewards. */
   spent: number
   /** Points of requests waiting for approval. */
   reserved: number
   /** What can be spent now; negative when points were taken back after spending. */
   available: number
}

export function balance(earned: number, redemptions: readonly { cost: number; status: RedemptionStatus }[]): Balance {
   const sum = (status: RedemptionStatus) => redemptions.filter((r) => r.status === status).reduce((n, r) => n + r.cost, 0)
   const spent = sum('approved')
   const reserved = sum('pending')
   return { earned, spent, reserved, available: earned - spent - reserved }
}

/** Status a request moves to, or null when the action isn't possible from `from`. */
export function nextStatus(from: RedemptionStatus, action: RedemptionAction): RedemptionStatus | null {
   if (from === 'pending') {
      if (action === 'approve') return 'approved'
      if (action === 'decline') return 'declined'
      if (action === 'cancel') return 'cancelled'
   }
   if (from === 'approved' && action === 'refund') return 'refunded'
   return null
}

/** Status of a new request: rewards that need approval wait, unless a manager asks (they'd approve it anyway). */
export const initialStatus = (needsApproval: boolean, requesterIsManager: boolean): RedemptionStatus =>
   needsApproval && !requesterIsManager ? 'pending' : 'approved'
