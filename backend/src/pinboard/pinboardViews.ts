import type { Types } from 'mongoose'
import { isOpen, results } from '../domain/pinboard'

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
      closesAt?: Date | null
      closedAt?: Date | null
      votes: { memberId: Id; optionIds: Id[]; at: Date }[]
   } | null
   editedAt?: Date | null
   createdAt: Date
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export function postView(p: StoredPost, now: Date) {
   const poll = p.poll
      ? (() => {
           const domain = {
              options: p.poll.options.map((o) => ({ id: o._id.toString(), text: o.text })),
              multiple: Boolean(p.poll.multiple),
              closesAt: p.poll.closesAt ?? null,
              closedAt: p.poll.closedAt ?? null,
              votes: p.poll.votes.map((v) => ({ memberId: v.memberId.toString(), optionIds: v.optionIds.map(String), at: v.at })),
           }
           const r = results(domain)
           return {
              multiple: domain.multiple,
              closesAt: iso(domain.closesAt),
              closedAt: iso(domain.closedAt),
              open: isOpen(domain, now),
              voters: r.voters,
              options: r.options,
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
