import { isValidObjectId, Types } from 'mongoose'
import { expiresAt, isOpen, UNPIN_EXPIRY, voteProblem } from '../domain/pinboard'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors'
import { canDeleteShared, canVoteFor } from '../households/permissions'
import { Membership, type MembershipType } from '../models/membershipModel'
import { Post } from '../models/postModel'
import { realtime } from '../socket/realtime'
import type { PostInput } from './pinboardSchemas'
import { postView } from './pinboardViews'

/** Posts shown at most (pinned first, then newest). App choice. */
const MAX_POSTS = 100

const notExpired = (now: Date) => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] })

export function createPinboardService() {
   const changed = (me: MembershipType) => realtime.householdChanged(me.householdId, 'pinboard')
   const isAuthor = (me: MembershipType, post: { authorId: Types.ObjectId }) => post.authorId.equals(me._id)

   async function findPost(me: MembershipType, id: string, now: Date) {
      const post = isValidObjectId(id) ? await Post.findOne({ _id: id, householdId: me.householdId, ...notExpired(now) }) : null
      if (!post) throw new NotFoundError('Post not found')
      return post
   }

   /** Pin, unpin, close, delete: who posted it, or admins and owners. */
   function assertCanModerate(me: MembershipType, post: { authorId: Types.ObjectId }) {
      if (!canDeleteShared(me.role, isAuthor(me, post))) throw new ForbiddenError('Only who posted it or an admin can do that.')
   }

   return {
      async list(me: MembershipType, now: Date) {
         const posts = await Post.find({ householdId: me.householdId, ...notExpired(now) })
            .sort({ pinned: -1, createdAt: -1 })
            .limit(MAX_POSTS)
            .lean()
         return posts.map((p) => postView(p, now))
      },

      async create(me: MembershipType, input: PostInput, now: Date) {
         const post = await Post.create({
            householdId: me.householdId,
            authorId: me._id,
            kind: input.kind,
            text: input.text,
            expiresAt: expiresAt(input.expiry, now),
            poll:
               input.kind === 'poll'
                  ? { options: input.options.map((text) => ({ text })), multiple: input.multiple, closesAt: expiresAt(input.closes, now), votes: [] }
                  : null,
         })
         changed(me)
         return postView(post, now)
      },

      /** Only the author edits the text; a poll's question only until someone has voted. */
      async edit(me: MembershipType, id: string, text: string, now: Date) {
         const post = await findPost(me, id, now)
         if (!isAuthor(me, post)) throw new ForbiddenError('Only who posted it can edit it.')
         if (post.poll && post.poll.votes.length > 0) throw new ConflictError('People have voted already; the question can’t change now.')
         post.text = text
         post.editedAt = now
         await post.save()
         changed(me)
         return postView(post, now)
      },

      /** Pinned posts stay until unpinned; unpinning gives them a week. */
      async pin(me: MembershipType, id: string, pinned: boolean, now: Date) {
         const post = await findPost(me, id, now)
         assertCanModerate(me, post)
         if (post.pinned !== pinned) {
            post.pinned = pinned
            post.expiresAt = pinned ? null : expiresAt(UNPIN_EXPIRY, now)
            await post.save()
            changed(me)
         }
         return postView(post, now)
      },

      async remove(me: MembershipType, id: string, now: Date) {
         const post = await findPost(me, id, now)
         assertCanModerate(me, post)
         await post.deleteOne()
         changed(me)
      },

      async close(me: MembershipType, id: string, now: Date) {
         const post = await findPost(me, id, now)
         if (!post.poll) throw new BadRequestError('Only polls can be closed.')
         assertCanModerate(me, post)
         if (!isOpen({ closesAt: post.poll.closesAt ?? null, closedAt: post.poll.closedAt ?? null }, now)) {
            throw new ConflictError('This poll is closed already.')
         }
         post.poll.closedAt = now
         await post.save()
         changed(me)
         return postView(post, now)
      },

      /**
       * Vote (or change / withdraw a vote) as yourself or for a profile. One atomic write that
       * replaces this person's earlier vote, and only while the poll is open, so votes at the same
       * moment don't overwrite each other and nothing slips in after closing.
       */
      async vote(me: MembershipType, id: string, input: { memberId?: string | undefined; optionIds: string[] }, now: Date) {
         const post = await findPost(me, id, now)
         if (!post.poll) throw new BadRequestError('This post isn’t a poll.')
         const targetId = input.memberId ?? me._id.toString()
         const target = isValidObjectId(targetId)
            ? await Membership.findOne({ _id: targetId, householdId: me.householdId }).select('userId').lean()
            : null
         if (!target) throw new BadRequestError('Pick someone of this household.')
         if (!canVoteFor(target._id.equals(me._id), Boolean(target.userId))) {
            throw new ForbiddenError('You can vote for yourself and for profiles without a login.')
         }
         const options = post.poll.options.map((o) => ({ id: o._id.toString(), text: o.text }))
         const problem = voteProblem({ options, multiple: Boolean(post.poll.multiple) }, input.optionIds)
         if (problem) throw new BadRequestError(problem)

         const vote = { memberId: target._id, optionIds: input.optionIds.map((o) => new Types.ObjectId(o)), at: now }
         // Native driver: an aggregation-pipeline update (Mongoose 9 only allows them on request).
         const result = await Post.collection.updateOne(
            {
               _id: post._id,
               'poll.closedAt': null,
               $or: [{ 'poll.closesAt': null }, { 'poll.closesAt': { $gt: now } }],
            },
            [
               {
                  $set: {
                     'poll.votes': {
                        $concatArrays: [
                           { $filter: { input: '$poll.votes', cond: { $ne: ['$$this.memberId', target._id] } } },
                           input.optionIds.length ? [{ $literal: vote }] : [],
                        ],
                     },
                     updatedAt: now,
                  },
               },
            ],
         )
         if (result.matchedCount === 0) throw new ConflictError('This poll is closed.')
         changed(me)
         const fresh = await Post.findById(post._id).lean()
         if (!fresh) throw new NotFoundError('Post not found')
         return postView(fresh, now)
      },
   }
}

export type PinboardService = ReturnType<typeof createPinboardService>
