import { useId, useState } from 'react'
import { Check, Lock, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import type { Member } from '@/features/households/householdsApi'
import { Person } from '@/features/stats/parts'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'
import { linkify, relativeTime, shortDate } from './format'
import { useClosePoll, useDeletePost, useEditPost, usePinPost, useVote, type Post } from './pinboardApi'

type PostCardProps = {
   householdId: string
   post: Post
   members: Member[]
   /** Who votes: you, or a profile picked in the board's "Voting as". */
   voterId: string | undefined
   /** Owner or admin: may pin, close and delete anyone's posts. */
   manager: boolean
   now: Date
}

/** A note or poll on the pinboard. */
export function PostCard({ householdId, post, members, voterId, manager, now }: PostCardProps) {
   const member = (id: string) => members.find((m) => m.id === id)
   const author = member(post.authorId)
   const isAuthor = Boolean(author?.isMe)
   // Same rule as the server (canDeleteShared): who posted it, or admins and owners.
   const canModerate = isAuthor || manager
   const pin = usePinPost(householdId)
   const close = useClosePoll(householdId)
   const [editing, setEditing] = useState(false)
   const [deleting, setDeleting] = useState(false)
   const canEdit = isAuthor && (post.kind === 'note' || post.poll?.voters === 0)
   const fail = (e: unknown) => toast.error(apiError(e).message)

   return (
      <article
         aria-label={`${post.kind === 'poll' ? 'Poll' : 'Note'} by ${author?.fname ?? 'someone who left'}`}
         className={cn('flex flex-col gap-3 rounded-2xl border bg-card p-4', post.pinned && 'border-primary/40 bg-primary/5')}
      >
         <header className='flex items-start justify-between gap-2'>
            <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
               <Person member={author} />
               <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()} className='text-muted-foreground'>
                  {relativeTime(post.createdAt, now)}
               </time>
               {post.editedAt && <span className='text-muted-foreground'>· edited</span>}
               {post.pinned && (
                  <span className='inline-flex items-center gap-1 text-xs font-medium text-primary'>
                     <Pin className='size-3.5' aria-hidden />
                     Pinned
                  </span>
               )}
            </div>
            {(canModerate || canEdit) && (
               <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant='ghost' size='icon-sm' aria-label={`More for this ${post.kind}`} />}>
                     <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                     {canEdit && (
                        <DropdownMenuItem onClick={() => setEditing(true)}>
                           <Pencil />
                           Edit
                        </DropdownMenuItem>
                     )}
                     {canModerate && (
                        <DropdownMenuItem
                           onClick={() =>
                              pin.mutate(
                                 { id: post.id, pinned: !post.pinned },
                                 { onSuccess: () => toast.success(post.pinned ? 'Unpinned: it stays for a week' : 'Pinned: it stays until unpinned'), onError: fail },
                              )
                           }
                        >
                           {post.pinned ? <PinOff /> : <Pin />}
                           {post.pinned ? 'Unpin' : 'Pin to the top'}
                        </DropdownMenuItem>
                     )}
                     {canModerate && post.poll?.open && (
                        <DropdownMenuItem onClick={() => close.mutate(post.id, { onSuccess: () => toast.success('Poll closed'), onError: fail })}>
                           <Lock />
                           Close voting
                        </DropdownMenuItem>
                     )}
                     {canModerate && (
                        <>
                           <DropdownMenuSeparator />
                           <DropdownMenuItem variant='destructive' onClick={() => setDeleting(true)}>
                              <Trash2 />
                              Delete
                           </DropdownMenuItem>
                        </>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>
            )}
         </header>

         <p className={cn('wrap-break-word whitespace-pre-wrap', post.kind === 'poll' && 'font-medium')}>
            {linkify(post.text).map((part, i) =>
               part.kind === 'link' ? (
                  <a key={i} href={part.value} target='_blank' rel='noopener noreferrer nofollow' className='text-primary underline underline-offset-2 break-all'>
                     {part.value}
                  </a>
               ) : (
                  <span key={i}>{part.value}</span>
               ),
            )}
         </p>

         {post.poll && <PollView householdId={householdId} post={post} poll={post.poll} member={member} voterId={voterId} now={now} />}

         {post.expiresAt && !post.pinned && (
            <p className='text-xs text-muted-foreground'>
               Shown until <time dateTime={post.expiresAt}>{shortDate(post.expiresAt, now)}</time>
            </p>
         )}

         {editing && <EditDialog householdId={householdId} post={post} onClose={() => setEditing(false)} />}
         <DeletePost householdId={householdId} post={post} open={deleting} onClose={() => setDeleting(false)} />
      </article>
   )
}

function PollView({
   householdId,
   post,
   poll,
   member,
   voterId,
   now,
}: {
   householdId: string
   post: Post
   poll: NonNullable<Post['poll']>
   member: (id: string) => Member | undefined
   voterId: string | undefined
   now: Date
}) {
   const id = useId()
   const vote = useVote(householdId)
   const mine = poll.options.filter((o) => voterId && o.voterIds.includes(voterId)).map((o) => o.id)
   const most = Math.max(1, ...poll.options.map((o) => o.count))
   const voterName = voterId ? member(voterId) : undefined
   const toggle = (optionId: string) => {
      if (!voterId) return
      const picked = mine.includes(optionId)
      const next = poll.multiple ? (picked ? mine.filter((x) => x !== optionId) : [...mine, optionId]) : picked ? [] : [optionId]
      vote.mutate({ id: post.id, memberId: voterId, optionIds: next }, { onError: (e) => toast.error(apiError(e).message) })
   }

   return (
      <div className='space-y-2'>
         <p id={`${id}-hint`} className='text-xs text-muted-foreground'>
            {!poll.open
               ? `Voting closed · ${poll.voters} ${poll.voters === 1 ? 'vote' : 'votes'}`
               : `${poll.multiple ? 'Pick as many as you like' : 'Pick one'}${voterName && !voterName.isMe ? ` for ${voterName.fname}` : ''}; tap again to take it back · ${poll.voters} ${poll.voters === 1 ? 'vote' : 'votes'}${poll.closesAt ? ` · ends ${shortDate(poll.closesAt, now)}` : ''}`}
         </p>
         <ul className='space-y-1.5'>
            {poll.options.map((o) => {
               const picked = mine.includes(o.id)
               const voters = o.voterIds.map(member)
               return (
                  <li key={o.id}>
                     <button
                        type='button'
                        aria-pressed={picked}
                        aria-describedby={`${id}-hint`}
                        disabled={!poll.open || !voterId || vote.isPending}
                        onClick={() => toggle(o.id)}
                        className={cn(
                           'relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default',
                           picked ? 'border-primary' : 'hover:border-primary/50 disabled:hover:border-border',
                        )}
                     >
                        {/* Share of the most-voted option (decorative; the count is the text). */}
                        <span aria-hidden className='absolute inset-y-0 left-0 bg-primary/10 transition-[width]' style={{ width: `${(o.count / most) * 100}%` }} />
                        <span
                           aria-hidden
                           className={cn(
                              'relative grid size-4.5 shrink-0 place-items-center rounded-full border',
                              poll.multiple && 'rounded-md',
                              picked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/60',
                           )}
                        >
                           {picked && <Check className='size-3' />}
                        </span>
                        <span className='relative min-w-0 flex-1 font-medium wrap-break-word'>{o.text}</span>
                        <span className='relative flex -space-x-1.5' aria-hidden>
                           {voters.slice(0, 5).map((m, i) => (
                              <Avatar key={m?.id ?? i} className='size-5 ring-2 ring-card'>
                                 {m && <AvatarImage src={avatarSrc(m)} alt='' />}
                                 <AvatarFallback className='bg-muted text-[0.5rem] font-semibold text-foreground'>{m ? initials(m) : '?'}</AvatarFallback>
                              </Avatar>
                           ))}
                        </span>
                        <span className='relative w-5 text-right font-semibold tabular-nums'>{o.count}</span>
                        <span className='sr-only'>
                           {o.count === 0 ? ', no votes' : `, ${o.count} ${o.count === 1 ? 'vote' : 'votes'}: ${voters.map((m) => m?.fname ?? 'someone who left').join(', ')}`}
                        </span>
                     </button>
                  </li>
               )
            })}
         </ul>
      </div>
   )
}

function EditDialog({ householdId, post, onClose }: { householdId: string; post: Post; onClose: () => void }) {
   const id = useId()
   const edit = useEditPost(householdId)
   const [text, setText] = useState(post.text)
   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>{post.kind === 'poll' ? 'Edit question' : 'Edit note'}</DialogTitle>
               <DialogDescription>{post.kind === 'poll' ? 'The question can change until someone votes.' : 'Everyone sees that it was edited.'}</DialogDescription>
            </DialogHeader>
            <label htmlFor={`${id}-text`} className='sr-only'>
               {post.kind === 'poll' ? 'Question' : 'Note'}
            </label>
            <Textarea id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} maxLength={post.kind === 'poll' ? 300 : 1000} rows={4} autoFocus />
            <DialogFooter>
               <Button variant='ghost' onClick={onClose}>
                  Cancel
               </Button>
               <Button
                  disabled={!text.trim() || edit.isPending}
                  onClick={() =>
                     edit.mutate(
                        { id: post.id, text: text.trim() },
                        {
                           onSuccess: () => {
                              toast.success('Saved')
                              onClose()
                           },
                           onError: (e) => toast.error(apiError(e).message),
                        },
                     )
                  }
               >
                  Save
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}

function DeletePost({ householdId, post, open, onClose }: { householdId: string; post: Post; open: boolean; onClose: () => void }) {
   const remove = useDeletePost(householdId)
   return (
      <ConfirmDeleteDialog
         open={open}
         onOpenChange={(next) => !next && onClose()}
         title={post.kind === 'poll' ? 'Delete this poll?' : 'Delete this note?'}
         description={post.kind === 'poll' ? 'The poll and all votes are removed for everyone.' : 'It’s removed for everyone.'}
         isPending={remove.isPending}
         onConfirm={() =>
            remove.mutate(post.id, {
               onSuccess: () => {
                  toast.success('Deleted')
                  onClose()
               },
               onError: (e) => toast.error(apiError(e).message),
            })
         }
      />
   )
}
