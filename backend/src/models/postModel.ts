import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'

export const POST_KINDS = ['note', 'poll'] as const

const voteSchema = new Schema(
   {
      memberId: { type: Types.ObjectId, ref: 'Membership', required: true },
      optionIds: { type: [Schema.Types.ObjectId], default: [] },
      at: { type: Date, required: true },
   },
   { _id: false },
)

const pollSchema = new Schema(
   {
      options: { type: [new Schema({ text: { type: String, required: true, trim: true, maxlength: 100 } })], default: [] },
      multiple: { type: Boolean, default: false },
      closesAt: { type: Date, default: null },
      closedAt: { type: Date, default: null },
      /** Named votes (user decision): one entry per person, replaced when they change it. */
      votes: { type: [voteSchema], default: [] },
   },
   { _id: false },
)

/** A note or poll on the household's pinboard (home page). */
const postSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      authorId: { type: Types.ObjectId, ref: 'Membership', required: true },
      kind: { type: String, enum: POST_KINDS, required: true },
      /** The note, or the poll's question. */
      text: { type: String, required: true, trim: true, maxlength: 1000 },
      pinned: { type: Boolean, default: false },
      /** When it disappears; null = never (also while pinned). */
      expiresAt: { type: Date, default: null },
      poll: { type: pollSchema, default: null },
      /** When the text was last changed (votes and pins also touch updatedAt). */
      editedAt: { type: Date, default: null },
   },
   { timestamps: true },
)
postSchema.index({ householdId: 1, pinned: -1, createdAt: -1 })
// MongoDB removes expired posts (about once a minute); reads also filter them, so they vanish on time.
postSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type PostType = HydratedDocument<InferSchemaType<typeof postSchema>>
export const Post = model('Post', postSchema)
