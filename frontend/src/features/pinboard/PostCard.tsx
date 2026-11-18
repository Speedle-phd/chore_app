import { useId, useState } from 'react'
import { Lock, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import type { Member } from '@/features/households/householdsApi'
import { Person } from '@/features/stats/parts'
import { cn } from '@/lib/utils'
import { linkify, relativeTime, shortDate } from './format'
import { useClosePoll, useDeletePost, useEditPost, usePinPost, type Post } from './pinboardApi'
import { PollView } from './PollView'

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

         {post.poll && <PollView householdId={householdId} post={post} poll={post.poll} members={members} voterId={voterId} now={now} />}

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
