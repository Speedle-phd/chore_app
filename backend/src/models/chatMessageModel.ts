import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

export const MAX_MESSAGE_LENGTH = 2000

/**
 * One message in the household chat (user decision 2026-11-17: one chat per household,
 * kept until deleted). Deleting keeps the message's place: text removed, "message removed" shown.
 */
const chatMessageSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      authorId: { type: Types.ObjectId, ref: 'Membership', required: true },
      text: { type: String, trim: true, maxlength: MAX_MESSAGE_LENGTH, default: '' },
      editedAt: { type: Date, default: null },
      deletedAt: { type: Date, default: null },
      deletedBy: { type: Types.ObjectId, ref: 'Membership', default: null },
      /** Emoji reactions, one per person and emoji (see domain/reactions.ts). */
      reactions: {
         type: [
            new Schema(
               {
                  emoji: { type: String, required: true, maxlength: 32 },
                  memberId: { type: Types.ObjectId, ref: 'Membership', required: true },
                  at: { type: Date, required: true },
               },
               { _id: false },
            ),
         ],
         default: [],
      },
   },
   { timestamps: true },
)
// Pages of the newest messages (by _id, which follows creation order) and unread counts.
chatMessageSchema.index({ householdId: 1, _id: -1 })
chatMessageSchema.index({ householdId: 1, createdAt: -1 })

export type ChatMessageType = HydratedDocument<InferSchemaType<typeof chatMessageSchema>>
export const ChatMessage = model('ChatMessage', chatMessageSchema)
