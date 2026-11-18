import { isValidObjectId } from 'mongoose'
import { MAX_DISTINCT } from '../domain/reactions'
import { ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { canDeleteShared } from '../households/permissions'
import { ChatMessage } from '../models/chatMessageModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { realtime } from '../socket/realtime'
import { messageView } from './chatViews'

/** Unread counts stop here (the badge shows "99+"). App choice. */
const MAX_UNREAD = 100

/**
 * Household chat (user decisions 2026-11-17): one conversation per household; messages are
 * kept; authors edit and delete their own, owners/admins can remove any. Only accounts chat:
 * requests always come from a signed-in member, profiles have no login.
 */
export function createChatService() {
   const changed = (me: MembershipType) => realtime.householdChanged(me.householdId, 'chat')

   async function findMessage(me: MembershipType, id: string) {
      const message = isValidObjectId(id) ? await ChatMessage.findOne({ _id: id, householdId: me.householdId }) : null
      if (!message) throw new NotFoundError('Message not found')
      return message
   }

   /** Messages by others since the last read position (since joining, at first). */
   async function unread(me: MembershipType) {
      const membership = await Membership.findById(me._id).select('chatReadAt createdAt').lean()
      const since = membership?.chatReadAt ?? membership?.createdAt ?? new Date(0)
      const count = await ChatMessage.countDocuments(
         { householdId: me.householdId, authorId: { $ne: me._id }, deletedAt: null, createdAt: { $gt: since } },
         { limit: MAX_UNREAD },
      )
      return { count, readAt: since.toISOString() }
   }

   return {
      unread,

      /** Newest messages (or those before `before`), oldest first; `hasMore` = earlier ones exist. */
      async page(me: MembershipType, query: { before?: string | undefined; limit: number }) {
         const found = await ChatMessage.find({ householdId: me.householdId, ...(query.before ? { _id: { $lt: query.before } } : {}) })
            .sort({ _id: -1 })
            .limit(query.limit + 1)
            .lean()
         const hasMore = found.length > query.limit
         return { messages: found.slice(0, query.limit).reverse().map(messageView), hasMore }
      },

      async send(me: MembershipType, text: string) {
         const message = await ChatMessage.create({ householdId: me.householdId, authorId: me._id, text })
         // Your own message counts as read.
         await Membership.updateOne({ _id: me._id }, { $set: { chatReadAt: message.createdAt } })
         changed(me)
         return messageView(message)
      },

      async edit(me: MembershipType, id: string, text: string, now: Date) {
         const message = await findMessage(me, id)
         if (!message.authorId.equals(me._id)) throw new ForbiddenError('Only who wrote it can edit it.')
         if (message.deletedAt) throw new ConflictError('This message was removed.')
         message.text = text
         message.editedAt = now
         await message.save()
         changed(me)
         return messageView(message)
      },

      /** Author, or admins and owners. The place stays ("message removed"); the text is gone for good. */
      async remove(me: MembershipType, id: string, now: Date) {
         const message = await findMessage(me, id)
         if (!canDeleteShared(me.role, message.authorId.equals(me._id))) throw new ForbiddenError('Only who wrote it or an admin can remove it.')
         if (!message.deletedAt) {
            message.text = ''
            message.set('reactions', [])
            message.deletedAt = now
            message.deletedBy = me._id
            await message.save()
            changed(me)
         }
         return messageView(message)
      },

      /**
       * Toggle my reaction: added if I haven't given this emoji, else taken back. Each change is one
       * conditional write, so two quick clicks can't add it twice.
       */
      async react(me: MembershipType, id: string, emoji: string, now: Date) {
         const message = await findMessage(me, id)
         if (message.deletedAt) throw new ConflictError('This message was removed.')
         const mine = message.reactions.some((r) => r.emoji === emoji && r.memberId.equals(me._id))
         if (mine) {
            await ChatMessage.updateOne({ _id: message._id }, { $pull: { reactions: { emoji, memberId: me._id } } })
         } else {
            const distinct = new Set(message.reactions.map((r) => r.emoji))
            if (!distinct.has(emoji) && distinct.size >= MAX_DISTINCT) throw new ConflictError('This message has enough different reactions.')
            await ChatMessage.updateOne(
               { _id: message._id, deletedAt: null, reactions: { $not: { $elemMatch: { emoji, memberId: me._id } } } },
               { $push: { reactions: { emoji, memberId: me._id, at: now } } },
            )
         }
         changed(me)
         return messageView(await findMessage(me, id))
      },

      /** Read up to this message; the position only ever moves forward. */
      async markRead(me: MembershipType, upTo: string) {
         const message = await findMessage(me, upTo)
         await Membership.updateOne(
            { _id: me._id, $or: [{ chatReadAt: null }, { chatReadAt: { $lt: message.createdAt } }] },
            { $set: { chatReadAt: message.createdAt } },
         )
         return unread(me)
      },
   }
}

export type ChatService = ReturnType<typeof createChatService>
