import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, MessageCircle, MoreHorizontal, Pencil, RefreshCw, SendHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import type { Household, Member } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'
import { linkify } from '@/features/pinboard/format'
import { EmojiPicker } from '@/features/emoji/EmojiPicker'
import { useInsertEmoji } from '@/features/emoji/useInsertEmoji'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'
import { flatten, useDeleteMessage, useEditMessage, useMarkRead, useMessages, useSendMessage, useUnread, type ChatMessage } from './chatApi'
import { groupMessages } from './grouping'
import { AddReaction, ReactionChips } from './Reactions'
import { typingText } from './typing'
import { useTyping } from './useTyping'

/** Same limit as the server (models/chatMessageModel.ts). */
const MAX_LENGTH = 2000
/** Closer to the bottom than this counts as "at the bottom" (new messages scroll into view). */
const NEAR_BOTTOM_PX = 120
/** Further up than this shows the "jump to the newest" button. App choice. */
const JUMP_AFTER_PX = 400

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

function Text({ text }: { text: string }) {
   return (
      <>
         {linkify(text).map((part, i) =>
            part.kind === 'link' ? (
               <a key={i} href={part.value} target='_blank' rel='noopener noreferrer nofollow' className='break-all underline underline-offset-2'>
                  {part.value}
               </a>
            ) : (
               <span key={i}>{part.value}</span>
            ),
         )}
      </>
   )
}

/** The "…" after "Ann is typing": dots that light up in turn (still with reduced motion). */
function TypingDots() {
   return (
      <span className='ms-0.5 inline-flex shrink-0 gap-0.5'>
         {[0, 160, 320].map((delay) => (
            <span
               key={delay}
               className='size-[0.2rem] translate-y-[-0.05rem] rounded-full bg-current animate-typing-dot motion-reduce:animate-none'
               style={{ animationDelay: `${delay}ms` }}
            />
         ))}
      </span>
   )
}

/** The household chat: one conversation for everyone with a login. */
export function Chat({ household, members }: { household: Household; members: Member[] }) {
   const id = useId()
   const messages = useMessages(household.id)
   const unread = useUnread(household.id)
   const markRead = useMarkRead(household.id)
   const send = useSendMessage(household.id)
   const list = flatten(messages.data)
   const me = members.find((m) => m.isMe)
   const manager = canManage(household.role)
   const member = (mid: string) => members.find((m) => m.id === mid)
   const [draft, setDraft] = useState('')
   const [editingId, setEditingId] = useState<string | null>(null)
   const [newBelow, setNewBelow] = useState(false)
   // Scrolled away from the top (fade the top edge) / far from the bottom (jump button).
   const [scrolled, setScrolled] = useState(false)
   const [farUp, setFarUp] = useState(false)
   const [now] = useState(() => new Date())
   const scroller = useRef<HTMLDivElement>(null)
   const field = useRef<HTMLTextAreaElement>(null)
   const insertEmoji = useInsertEmoji(field, draft, setDraft)
   const typing = useTyping(household.id, me?.id)
   const typingLine = typingText(typing.typingIds.map((mid) => member(mid)?.fname ?? 'Someone'))
   // Screen readers hear it only when someone starts while nobody was typing, not on every change.
   const someoneTyping = typingLine !== null
   const [typingWas, setTypingWas] = useState(false)
   const [typingAnnounced, setTypingAnnounced] = useState('')
   if (someoneTyping !== typingWas) {
      setTypingWas(someoneTyping)
      setTypingAnnounced(typingLine ? `${typingLine}…` : '')
   }

   // Where "New messages" goes: the read position when the chat was opened (fixed while open).
   const [readAtOnOpen, setReadAtOnOpen] = useState<string | null>(null)
   useEffect(() => {
      if (readAtOnOpen === null && unread.data) setReadAtOnOpen(unread.data.readAt)
   }, [readAtOnOpen, unread.data])
   const firstNewId = readAtOnOpen ? list.find((m) => m.createdAt > readAtOnOpen && m.authorId !== me?.id)?.id : undefined

   const atBottom = () => {
      const el = scroller.current
      return !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
   }
   const toBottom = (smooth = false) => {
      const el = scroller.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
      setNewBelow(false)
   }

   // New message at the bottom: follow it if we were there (or it's ours), else offer a jump button.
   // Earlier messages at the top: keep what's on screen in place.
   const newestId = list[list.length - 1]?.id
   const oldestId = list[0]?.id
   const seen = useRef<{ newest?: string | undefined; oldest?: string | undefined; height: number; wasAtBottom: boolean }>({ height: 0, wasAtBottom: true })
   useLayoutEffect(() => {
      const el = scroller.current
      if (!el || !newestId) return
      const before = seen.current
      if (!before.newest) toBottom()
      else if (oldestId !== before.oldest && newestId === before.newest) el.scrollTop += el.scrollHeight - before.height
      else if (newestId !== before.newest) {
         const mine = list[list.length - 1]?.authorId === me?.id
         if (before.wasAtBottom || mine) toBottom(true)
         else setNewBelow(true)
      }
      seen.current = { newest: newestId, oldest: oldestId, height: el.scrollHeight, wasAtBottom: atBottom() }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the first or last message changes
   }, [newestId, oldestId])

   // Their message arrived: no longer "typing".
   const newestAuthor = list[list.length - 1]?.authorId
   const { arrived } = typing
   useEffect(() => {
      if (newestAuthor) arrived(newestAuthor)
   }, [newestId, newestAuthor, arrived])

   // Mark as read while the chat is on screen (and the tab visible).
   useEffect(() => {
      const read = () => {
         if (!newestId || document.visibilityState !== 'visible' || !unread.data?.count) return
         if (atBottom()) markRead.mutate(newestId)
      }
      read()
      document.addEventListener('visibilitychange', read)
      return () => document.removeEventListener('visibilitychange', read)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- markRead is stable enough; re-run on new data
   }, [newestId, unread.data?.count])

   const submit = () => {
      const text = draft.trim()
      if (!text || send.isPending) return
      setDraft('')
      typing.stop()
      send.mutate(text, {
         onError: (e) => {
            setDraft(text) // nothing lost
            toast.error(apiError(e).message)
         },
      })
   }

   const days = groupMessages(list, now)

   return (
      <section aria-label='Household chat' className='flex h-[min(72dvh,680px)] min-h-96 flex-col overflow-hidden rounded-2xl border bg-card'>
         <div className='relative min-h-0 flex-1'>
         <div
            ref={scroller}
            onScroll={() => {
               const el = scroller.current
               seen.current.wasAtBottom = atBottom()
               if (newBelow && atBottom()) setNewBelow(false)
               if (atBottom() && unread.data?.count && newestId) markRead.mutate(newestId)
               if (el) {
                  setScrolled(el.scrollTop > 8)
                  setFarUp(el.scrollHeight - el.scrollTop - el.clientHeight > JUMP_AFTER_PX)
               }
            }}
            className='h-full overflow-y-auto px-3 pt-4 pb-9 scrollbar-slim sm:px-5'
         >
            {messages.hasNextPage && (
               <div className='mb-4 flex justify-center'>
                  <Button variant='outline' size='sm' disabled={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
                     {messages.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
                  </Button>
               </div>
            )}
            {messages.isPending ? (
               <p role='status' className='py-10 text-center text-sm text-muted-foreground'>
                  Loading messages…
               </p>
            ) : messages.isError ? (
               <div className='flex flex-col items-center gap-3 py-10 text-center text-sm'>
                  <p>Couldn’t load the chat: {apiError(messages.error).message}</p>
                  <Button variant='outline' size='sm' onClick={() => void messages.refetch()}>
                     <RefreshCw />
                     Try again
                  </Button>
               </div>
            ) : list.length === 0 ? (
               <div className='flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
                  <MessageCircle className='size-8' aria-hidden />
                  <p>No messages yet. Say hello to {household.name}!</p>
               </div>
            ) : (
               <div role='log' aria-label='Messages' className='space-y-5'>
                  {days.map((day) => (
                     <div key={day.key} className='space-y-1'>
                        <p className='sticky top-1 z-20 mb-2 flex justify-center'>
                           <span className='rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground shadow-sm'>{day.label}</span>
                        </p>
                        {day.rows.map(({ message, first }) => (
                           <div key={message.id}>
                              {message.id === firstNewId && (
                                 <p className='my-3 flex items-center gap-3 text-xs font-semibold text-primary'>
                                    <span className='h-px flex-1 bg-primary/40' aria-hidden />
                                    New messages
                                    <span className='h-px flex-1 bg-primary/40' aria-hidden />
                                 </p>
                              )}
                              <MessageRow
                                 householdId={household.id}
                                 message={message}
                                 author={member(message.authorId)}
                                 mine={message.authorId === me?.id}
                                 first={first || message.id === firstNewId}
                                 canRemove={message.authorId === me?.id || manager}
                                 members={members}
                                 myId={me?.id}
                                 editing={editingId === message.id}
                                 onEdit={(on) => setEditingId(on ? message.id : null)}
                              />
                           </div>
                        ))}
                     </div>
                  ))}
               </div>
            )}
         </div>
            {/* The top edge fades out once you scroll (messages slide away under it); the day label stays above. */}
            <div
               aria-hidden
               className={cn(
                  'pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-linear-to-b from-card to-transparent transition-opacity duration-300 motion-reduce:transition-none',
                  scrolled ? 'opacity-100' : 'opacity-0',
               )}
            />
            {(newBelow || farUp) && (
               <Button
                  size={newBelow ? 'sm' : 'icon'}
                  variant={newBelow ? 'default' : 'outline'}
                  aria-label={newBelow ? undefined : 'Jump to the newest message'}
                  title={newBelow ? undefined : 'Jump to the newest message'}
                  className='absolute right-4 bottom-4 z-20 rounded-full shadow-lg'
                  onClick={() => toBottom(true)}
               >
                  <ArrowDown />
                  {newBelow && 'New messages'}
               </Button>
            )}
            {/* Shown to the eye here; screen readers get the status below (announced once per start). */}
            {typingLine && (
               <p
                  aria-hidden
                  className='pointer-events-none absolute bottom-2 left-3 z-20 flex max-w-[calc(100%-5rem)] items-baseline rounded-full border bg-card px-2.5 py-0.5 text-xs text-muted-foreground shadow-sm sm:left-5'
               >
                  <span className='truncate'>{typingLine}</span>
                  <TypingDots />
               </p>
            )}
            <p role='status' className='sr-only'>
               {typingAnnounced}
            </p>
         </div>

         <form
            className='flex items-end gap-2 border-t bg-card p-3'
            onSubmit={(e) => {
               e.preventDefault()
               submit()
            }}
         >
            <EmojiPicker onPick={insertEmoji} field={field} side='top' className='size-10' />
            <label htmlFor={`${id}-draft`} className='sr-only'>
               Message to {household.name}
            </label>
            <Textarea
               ref={field}
               id={`${id}-draft`}
               value={draft}
               onChange={(e) => {
                  setDraft(e.target.value)
                  typing.changed(e.target.value)
               }}
               onKeyDown={(e) => {
                  // Enter sends; Shift+Enter (and IME composition) make a new line.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                     e.preventDefault()
                     submit()
                  }
               }}
               maxLength={MAX_LENGTH}
               rows={1}
               placeholder='Write a message…'
               aria-describedby={`${id}-draft-hint`}
               className='max-h-40 min-h-10 resize-none'
            />
            <span id={`${id}-draft-hint`} className='sr-only'>
               Enter sends, Shift+Enter starts a new line.
            </span>
            <Button type='submit' size='icon-lg' aria-label='Send' disabled={!draft.trim() || send.isPending}>
               <SendHorizontal />
            </Button>
         </form>
      </section>
   )
}

function MessageRow({
   householdId,
   message,
   author,
   mine,
   first,
   canRemove,
   editing,
   onEdit,
   members,
   myId,
}: {
   householdId: string
   message: ChatMessage
   author: Member | undefined
   mine: boolean
   first: boolean
   canRemove: boolean
   editing: boolean
   onEdit: (on: boolean) => void
   members: Member[]
   myId: string | undefined
}) {
   const edit = useEditMessage(householdId)
   const remove = useDeleteMessage(householdId)
   const [text, setText] = useState(message.text)
   const [removing, setRemoving] = useState(false)
   const editField = useRef<HTMLTextAreaElement>(null)
   const insertEmoji = useInsertEmoji(editField, text, setText)
   const name = mine ? 'You' : (author?.fname ?? 'Someone who left')
   const fail = (e: unknown) => toast.error(apiError(e).message)
   const save = () => {
      const next = text.trim()
      if (!next || next === message.text) return onEdit(false)
      edit.mutate({ id: message.id, text: next }, { onSuccess: () => onEdit(false), onError: fail })
   }

   return (
      <div className={cn('group flex items-end gap-2', mine && 'flex-row-reverse', first ? 'mt-3' : 'mt-0.5')}>
         {!mine && (
            <span className='w-7 shrink-0'>
               {first && (
                  <Avatar className='size-7' aria-hidden>
                     {author && <AvatarImage src={avatarSrc(author)} alt='' />}
                     <AvatarFallback className='bg-muted text-[0.625rem] font-semibold text-foreground'>{author ? initials(author) : '?'}</AvatarFallback>
                  </Avatar>
               )}
            </span>
         )}
         <div className={cn('flex max-w-[min(80%,36rem)] min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
            {first && (
               <p className='mb-0.5 px-1 text-xs text-muted-foreground'>
                  <span className='font-medium text-foreground'>{name}</span> · <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
               </p>
            )}
            {editing ? (
               <div className='w-[min(36rem,70vw)] space-y-1.5'>
                  <label htmlFor={`edit-${message.id}`} className='sr-only'>
                     Edit your message
                  </label>
                  <Textarea
                     ref={editField}
                     id={`edit-${message.id}`}
                     value={text}
                     autoFocus
                     maxLength={MAX_LENGTH}
                     onChange={(e) => setText(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                           e.preventDefault()
                           setText(message.text)
                           onEdit(false)
                        } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                           e.preventDefault()
                           save()
                        }
                     }}
                  />
                  <div className='flex items-center justify-end gap-2'>
                     <EmojiPicker onPick={insertEmoji} field={editField} side='top' className='me-auto size-8' />
                     <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => {
                           setText(message.text)
                           onEdit(false)
                        }}
                     >
                        Cancel
                     </Button>
                     <Button size='sm' disabled={edit.isPending || !text.trim()} onClick={save}>
                        Save
                     </Button>
                  </div>
               </div>
            ) : (
               <div
                  className={cn(
                     'rounded-2xl px-3.5 py-2 text-sm wrap-break-word whitespace-pre-wrap',
                     message.deleted
                        ? 'border border-dashed text-muted-foreground italic'
                        : mine
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground',
                     mine ? 'rounded-br-md' : 'rounded-bl-md',
                     // Room for the reaction chips that sit on the bottom edge, so they never cover text.
                     !message.deleted && message.reactions.length > 0 && 'pb-4',
                  )}
               >
                  {/* Screen readers get who and when for every message, not only at the start of a run. */}
                  {!first && (
                     <span className='sr-only'>
                        {name}, <time dateTime={message.createdAt}>{time(message.createdAt)}</time>:{' '}
                     </span>
                  )}
                  {message.deleted ? 'Message removed' : <Text text={message.text} />}
                  {message.editedAt && <span className={cn('ms-1.5 text-xs', mine ? 'text-primary-foreground' : 'text-muted-foreground')}>(edited)</span>}
               </div>
            )}
            {!editing && !message.deleted && <ReactionChips householdId={householdId} message={message} members={members} myId={myId} mine={mine} />}
         </div>
         {!editing && !message.deleted && (
            <AddReaction householdId={householdId} message={message} myId={myId} label={`React to ${mine ? 'your' : `${name}’s`} message`} />
         )}
         {!editing && !message.deleted && (mine || canRemove) && (
            <DropdownMenu>
               <DropdownMenuTrigger
                  render={
                     <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`More for ${mine ? 'your' : `${name}’s`} message`}
                        className='shrink-0 self-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-60'
                     />
                  }
               >
                  <MoreHorizontal />
               </DropdownMenuTrigger>
               <DropdownMenuContent align={mine ? 'end' : 'start'}>
                  {mine && (
                     <DropdownMenuItem
                        onClick={() => {
                           setText(message.text)
                           onEdit(true)
                        }}
                     >
                        <Pencil />
                        Edit
                     </DropdownMenuItem>
                  )}
                  {canRemove && (
                     <DropdownMenuItem
                        variant='destructive'
                        onClick={() => setRemoving(true)}
                     >
                        <Trash2 />
                        Remove
                     </DropdownMenuItem>
                  )}
               </DropdownMenuContent>
            </DropdownMenu>
         )}
         <ConfirmDeleteDialog
            open={removing}
            onOpenChange={setRemoving}
            title='Remove this message?'
            description={mine ? 'It’s removed for everyone; “Message removed” stays in its place.' : `${name}’s message is removed for everyone; “Message removed” stays in its place.`}
            confirmLabel='Remove'
            isPending={remove.isPending}
            onConfirm={() =>
               remove.mutate(message.id, {
                  onSuccess: () => {
                     toast.success('Message removed')
                     setRemoving(false)
                  },
                  onError: (e) => {
                     fail(e)
                     setRemoving(false)
                  },
               })
            }
         />
      </div>
   )
}
