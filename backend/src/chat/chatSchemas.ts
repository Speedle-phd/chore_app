import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { isEmoji } from '../domain/reactions'
import { MAX_MESSAGE_LENGTH } from '../models/chatMessageModel'

const objectId = z.string().refine(isValidObjectId, 'Invalid id.')
const text = z.string().trim().min(1, 'Write a message.').max(MAX_MESSAGE_LENGTH, `At most ${MAX_MESSAGE_LENGTH} characters.`)

export const messageInputSchema = z.object({ text }).strict()

/** Newest page, or the page before a message ("Load earlier"). */
export const pageQuerySchema = z.object({
   before: objectId.optional(),
   limit: z.coerce.number().int().min(1).max(100).default(50),
})

/** React with this emoji, or take the reaction back if you already gave it. */
export const reactionSchema = z.object({ emoji: z.string().refine(isEmoji, 'Pick one emoji.') }).strict()

/** Read up to (and including) this message. */
export const readSchema = z.object({ upTo: objectId }).strict()
