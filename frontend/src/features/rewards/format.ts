import type { Balance, RedemptionStatus, Reward } from './rewardsApi'

export const points = (n: number) => `${n.toLocaleString()} ${Math.abs(n) === 1 ? 'point' : 'points'}`

export const STATUS_LABEL: Record<RedemptionStatus, string> = {
   pending: 'Waiting for approval',
   approved: 'Granted',
   declined: 'Declined',
   cancelled: 'Cancelled',
   refunded: 'Points given back',
}

/**
 * The reward card's button: its label, and why it can't be used (shown next to it).
 * A manager's request is granted at once (mirrors domain/rewards.ts initialStatus).
 */
export function redeemButton(reward: Reward, balance: Balance | undefined, isManager: boolean) {
   const asks = reward.needsApproval && !isManager
   const label = asks ? 'Ask for it' : 'Get it'
   if (!balance) return { label, disabled: true, reason: null }
   const missing = reward.cost - Math.max(balance.available, 0)
   if (missing > 0) return { label, disabled: true, reason: `${missing.toLocaleString()} more ${missing === 1 ? 'point' : 'points'} needed` }
   return { label, disabled: false, reason: null }
}
