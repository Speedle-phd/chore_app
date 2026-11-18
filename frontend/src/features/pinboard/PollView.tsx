import { useId, useState } from 'react'
import { motion } from 'motion/react'
import { Check, ChevronDown, Clock, EyeOff, Lock, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Member } from '@/features/households/householdsApi'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'
import { useVote, type Poll, type Post } from './pinboardApi'
import { endLabel, leaders, percent } from './pollState'

/** Avatars shown per option before "+n". */
const AVATARS = 3

const names = (list: (Member | undefined)[]) => list.map((m) => m?.fname ?? 'someone who left').join(', ')

function Faces({ people }: { people: (Member | undefined)[] }) {
   if (!people.length) return null
   return (
      <span aria-hidden className='relative flex items-center -space-x-1.5'>
         {people.slice(0, AVATARS).map((m, i) => (
            <Avatar key={m?.id ?? i} className='size-5 ring-2 ring-card'>
               {m && <AvatarImage src={avatarSrc(m)} alt='' />}
               <AvatarFallback className='bg-muted text-[0.5rem] font-semibold text-foreground'>{m ? initials(m) : '?'}</AvatarFallback>
            </Avatar>
         ))}
         {people.length > AVATARS && (
            <span className='grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1 text-[0.625rem] font-semibold ring-2 ring-card'>
               +{people.length - AVATARS}
            </span>
         )}
      </span>
   )
}

/** A poll's options as vote buttons with results, plus who voted. */
export function PollView({
   householdId,
   post,
   poll,
   members,
   voterId,
   now,
}: {
   householdId: string
   post: Post
   poll: Poll
   members: Member[]
   /** Who votes: you, or a profile picked in "Voting as". */
   voterId: string | undefined
   now: Date
}) {
   const id = useId()
   const vote = useVote(householdId)
   const [showVoters, setShowVoters] = useState(false)
   const member = (mid: string) => members.find((m) => m.id === mid)
   const voter = voterId ? member(voterId) : undefined
   const mine = poll.options.filter((o) => voterId && o.voterIds.includes(voterId)).map((o) => o.id)
   const top = leaders(poll)
   const ended = !poll.open
   const ends = endLabel(poll, now)
   const voted = new Set(poll.options.flatMap((o) => o.voterIds))
   const notYet = members.filter((m) => !voted.has(m.id))

   const toggle = (optionId: string) => {
      if (!voterId) return
      const picked = mine.includes(optionId)
      const next = poll.multiple ? (picked ? mine.filter((x) => x !== optionId) : [...mine, optionId]) : picked ? [] : [optionId]
      vote.mutate({ id: post.id, memberId: voterId, optionIds: next }, { onError: (e) => toast.error(apiError(e).message) })
   }

   const voteText = `${poll.voters} ${poll.voters === 1 ? 'vote' : 'votes'}`
   const hint = ended
      ? `Voting has ended · ${voteText}`
      : `${poll.multiple ? 'Pick as many as you like' : 'Pick one'}${voter && !voter.isMe ? ` for ${voter.fname}` : ''} · tap again to take it back`

   return (
      <div className='space-y-3'>
         <div className='flex flex-wrap items-center gap-1.5 text-xs'>
            <span className='rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground'>{poll.multiple ? 'Several answers' : 'One answer'}</span>
            {ends && (
               <span
                  className={cn(
                     'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                     ended ? 'bg-foreground/10 text-foreground' : 'bg-accent text-accent-foreground',
                  )}
               >
                  {ended ? <Lock className='size-3' aria-hidden /> : <Clock className='size-3' aria-hidden />}
                  {ends}
               </span>
            )}
            {!ended && <span className='text-muted-foreground'>{voteText}</span>}
         </div>

         <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
            {hint}
         </p>

         <ul className='space-y-2'>
            {poll.options.map((o) => {
               const picked = mine.includes(o.id)
               const share = percent(o.count, poll.voters)
               const leading = top.includes(o.id)
               const people = o.voterIds.map(member)
               return (
                  <li key={o.id}>
                     <button
                        type='button'
                        aria-pressed={picked}
                        aria-describedby={`${id}-hint`}
                        disabled={ended || !voterId}
                        onClick={() => toggle(o.id)}
                        className={cn(
                           'relative flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-xl border bg-background px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default sm:min-h-10',
                           picked ? 'border-primary ring-1 ring-primary' : 'enabled:hover:border-primary/50',
                        )}
                     >
                        {/* The bar: share of the people who voted (the number is the text next to it). */}
                        {poll.resultsVisible && (
                           <span
                              aria-hidden
                              className={cn(
                                 'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out motion-reduce:transition-none',
                                 leading ? 'bg-primary/20' : 'bg-primary/8',
                              )}
                              style={{ width: `${share}%` }}
                           />
                        )}
                        <span
                           aria-hidden
                           className={cn(
                              'relative grid size-5 shrink-0 place-items-center border-2 transition-colors',
                              poll.multiple ? 'rounded-md' : 'rounded-full',
                              picked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50 bg-card',
                           )}
                        >
                           {picked && (
                              <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
                                 <Check className='size-3.5' strokeWidth={3} />
                              </motion.span>
                           )}
                        </span>
                        <span className={cn('relative min-w-0 flex-1 wrap-break-word', leading && poll.resultsVisible ? 'font-semibold' : 'font-medium')}>
                           {o.text}
                           {ended && leading && (
                              <span className='ms-2 inline-flex items-center gap-1 align-middle text-xs font-semibold text-primary'>
                                 <Trophy className='size-3.5' aria-hidden />
                                 {top.length > 1 ? 'Tie' : 'Winner'}
                              </span>
                           )}
                        </span>
                        {poll.resultsVisible && (
                           <>
                              <Faces people={people} />
                              <span className='relative w-16 shrink-0 text-right tabular-nums'>
                                 <span className='font-semibold'>{share}%</span>{' '}
                                 <span className='text-xs text-muted-foreground'>({o.count})</span>
                              </span>
                              <span className='sr-only'>
                                 {picked ? ', your vote' : ''}
                                 {o.count ? `, ${o.count} ${o.count === 1 ? 'vote' : 'votes'}: ${names(people)}` : ', no votes'}
                              </span>
                           </>
                        )}
                        {!poll.resultsVisible && picked && <span className='sr-only'>, your vote</span>}
                     </button>
                  </li>
               )
            })}
         </ul>

         {!poll.resultsVisible ? (
            <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
               <EyeOff className='size-3.5' aria-hidden />
               {poll.voters ? `${voteText} so far. ` : ''}Vote to see the results.
            </p>
         ) : (
            poll.voters > 0 && (
               <div>
                  <button
                     type='button'
                     aria-expanded={showVoters}
                     aria-controls={`${id}-voters`}
                     onClick={() => setShowVoters(!showVoters)}
                     className='inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
                  >
                     <ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', showVoters && 'rotate-180')} aria-hidden />
                     Who voted
                  </button>
                  {showVoters && (
                     <dl id={`${id}-voters`} className='mt-2 space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm'>
                        {poll.options.map((o) => (
                           <div key={o.id} className='flex flex-wrap gap-x-2'>
                              <dt className='font-medium'>{o.text}:</dt>
                              <dd className='text-muted-foreground'>{o.voterIds.length ? names(o.voterIds.map(member)) : 'nobody'}</dd>
                           </div>
                        ))}
                        {!ended && notYet.length > 0 && (
                           <div className='flex flex-wrap gap-x-2 border-t pt-1.5'>
                              <dt className='font-medium'>Not voted yet:</dt>
                              <dd className='text-muted-foreground'>{names(notYet)}</dd>
                           </div>
                        )}
                     </dl>
                  )}
               </div>
            )
         )}
      </div>
   )
}
