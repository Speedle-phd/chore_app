import type { Types } from 'mongoose'
import { isOpen, results, resultsVisible } from '../domain/pinboard'

type Id = Types.ObjectId

type StoredPost = {
   _id: Id
   authorId: Id
   kind: string
   text: string
   pinned?: boolean | null
   expiresAt?: Date | null
   poll?: {
      options: { _id: Id; text: string }[]
      multiple?: boolean | null
      resultsAfterVote?: boolean | null
      closesAt?: Date | null
      closedAt?: Date | null
      votes: { memberId: Id; optionIds: Id[]; at: Date }[]
   } | null
   editedAt?: Date | null
   createdAt: Date
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

/** A post as `viewerId` may see it: with "results after voting", counts and names stay hidden until they voted. */
export function postView(p: StoredPost, now: Date, viewerId: string) {
   const poll = p.poll
      ? (() => {
           const domain = {
              options: p.poll.options.map((o) => ({ id: o._id.toString(), text: o.text })),
              multiple: Boolean(p.poll.multiple),
              resultsAfterVote: Boolean(p.poll.resultsAfterVote),
              closesAt: p.poll.closesAt ?? null,
              closedAt: p.poll.closedAt ?? null,
              votes: p.poll.votes.map((v) => ({ memberId: v.memberId.toString(), optionIds: v.optionIds.map(String), at: v.at })),
           }
           const r = results(domain)
           const visible = resultsVisible(domain, viewerId, now)
           return {
              multiple: domain.multiple,
              resultsAfterVote: domain.resultsAfterVote,
              /** False while this viewer must vote first: counts are null and names empty. */
              resultsVisible: visible,
              closesAt: iso(domain.closesAt),
              closedAt: iso(domain.closedAt),
              open: isOpen(domain, now),
              voters: r.voters,
              options: r.options.map((o) => (visible ? o : { id: o.id, text: o.text, count: null, voterIds: [] })),
           }
        })()
      : null
   return {
      id: p._id.toString(),
      kind: p.kind as 'note' | 'poll',
      text: p.text,
      authorId: p.authorId.toString(),
      pinned: Boolean(p.pinned),
      expiresAt: iso(p.expiresAt),
      poll,
      createdAt: p.createdAt.toISOString(),
      /** When the text was last changed after posting (votes and pins don't count). */
      editedAt: iso(p.editedAt),
   }
}
