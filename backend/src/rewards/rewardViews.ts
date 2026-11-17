import type { Types } from 'mongoose'
import type { RedemptionStatus } from '../domain/rewards'

type Id = Types.ObjectId

type StoredReward = {
   _id: Id
   title: string
   description?: string | null
   cost: number
   needsApproval?: boolean | null
   archivedAt?: Date | null
   createdBy: Id
}

export const rewardView = (r: StoredReward) => ({
   id: r._id.toString(),
   title: r.title,
   description: r.description ?? '',
   cost: r.cost,
   needsApproval: Boolean(r.needsApproval),
   archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
   createdBy: r.createdBy.toString(),
})

type StoredRedemption = {
   _id: Id
   rewardId: Id
   title: string
   cost: number
   memberId: Id
   requestedBy: Id
   status: string
   decidedBy?: Id | null
   decidedAt?: Date | null
   note?: string | null
   createdAt: Date
}

export const redemptionView = (r: StoredRedemption) => ({
   id: r._id.toString(),
   rewardId: r.rewardId.toString(),
   title: r.title,
   cost: r.cost,
   memberId: r.memberId.toString(),
   requestedBy: r.requestedBy.toString(),
   status: r.status as RedemptionStatus,
   decidedBy: r.decidedBy ? r.decidedBy.toString() : null,
   decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
   note: r.note ?? '',
   createdAt: r.createdAt.toISOString(),
})
