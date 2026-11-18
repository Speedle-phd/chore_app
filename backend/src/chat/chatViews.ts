import type { Types } from 'mongoose'
import { groupReactions } from '../domain/reactions'

type StoredMessage = {
   _id: Types.ObjectId
   authorId: Types.ObjectId
   text?: string | null
   editedAt?: Date | null
   deletedAt?: Date | null
   reactions?: { emoji: string; memberId: Types.ObjectId; at: Date }[] | null
   createdAt: Date
}

/** A deleted message keeps its place but carries no text. */
export const messageView = (m: StoredMessage) => ({
   id: m._id.toString(),
   authorId: m.authorId.toString(),
   text: m.deletedAt ? '' : (m.text ?? ''),
   deleted: Boolean(m.deletedAt),
   editedAt: m.editedAt && !m.deletedAt ? m.editedAt.toISOString() : null,
   reactions: m.deletedAt ? [] : groupReactions((m.reactions ?? []).map((r) => ({ emoji: r.emoji, memberId: r.memberId.toString(), at: r.at }))),
   createdAt: m.createdAt.toISOString(),
})
