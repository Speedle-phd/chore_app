import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { MAX_REWARD_COST } from '../models/rewardModels'

const objectId = z.string().refine(isValidObjectId, 'Invalid id.')
const cost = z
   .number()
   .int('Use a whole number of points.')
   .min(1, 'A reward costs at least 1 point.')
   .max(MAX_REWARD_COST, `At most ${MAX_REWARD_COST.toLocaleString('en')} points.`)

export const rewardInputSchema = z
   .object({
      title: z.string().trim().min(1, 'Enter a name for the reward.').max(80),
      description: z.string().trim().max(300).default(''),
      cost,
      needsApproval: z.boolean().default(false),
   })
   .strict()
export type RewardInput = z.infer<typeof rewardInputSchema>

export const rewardUpdateSchema = z
   .object({
      title: z.string().trim().min(1, 'Enter a name for the reward.').max(80),
      description: z.string().trim().max(300),
      cost,
      needsApproval: z.boolean(),
   })
   .partial()
   .strict()
   .refine((r) => Object.keys(r).length > 0, 'Nothing to change.')
export type RewardUpdate = z.infer<typeof rewardUpdateSchema>

/** Whose points to spend; yourself when left out. */
export const redeemSchema = z.object({ memberId: objectId.optional() }).strict()

export const decisionSchema = z.object({ note: z.string().trim().max(200).default('') }).strict()

export const memberParamSchema = z.object({ mid: objectId })
