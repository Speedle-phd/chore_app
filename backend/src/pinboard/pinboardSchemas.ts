import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { EXPIRY_PRESETS, MAX_OPTIONS, MIN_OPTIONS } from '../domain/pinboard'

const objectId = z.string().refine(isValidObjectId, 'Invalid id.')
const expiry = z.enum(EXPIRY_PRESETS)

const note = z
   .object({
      kind: z.literal('note'),
      text: z.string().trim().min(1, 'Write something.').max(1000),
      expiry: expiry.default('week'),
   })
   .strict()

const poll = z
   .object({
      kind: z.literal('poll'),
      text: z.string().trim().min(1, 'Ask a question.').max(300),
      options: z
         .array(z.string().trim().min(1, 'Options can’t be empty.').max(100))
         .min(MIN_OPTIONS, `Give at least ${MIN_OPTIONS} options.`)
         .max(MAX_OPTIONS, `At most ${MAX_OPTIONS} options.`)
         .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, 'Each option only once.'),
      multiple: z.boolean().default(false),
      /** Results only after voting (or once it has ended). */
      resultsAfterVote: z.boolean().default(false),
      expiry: expiry.default('week'),
      /** When voting ends; it can also be closed by hand. */
      closes: expiry.default('never'),
   })
   .strict()

export const postInputSchema = z.discriminatedUnion('kind', [note, poll])
export type PostInput = z.infer<typeof postInputSchema>

export const postUpdateSchema = z.object({ text: z.string().trim().min(1, 'Write something.').max(1000) }).strict()

/** Seen up to (and including) this post. */
export const readSchema = z.object({ upTo: objectId }).strict()

export const voteSchema = z
   .object({
      /** Whose vote; yourself when left out. */
      memberId: objectId.optional(),
      /** Empty = withdraw the vote. */
      optionIds: z.array(objectId).max(MAX_OPTIONS),
   })
   .strict()
