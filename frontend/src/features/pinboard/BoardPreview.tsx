import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ListChecks, MessageCircle, Pin, StickyNote } from 'lucide-react'
import { useUnread } from '@/features/chat/chatApi'
import type { Household, Member } from '@/features/households/householdsApi'
import { cn } from '@/lib/utils'
import { relativeTime } from './format'
import { usePosts } from './pinboardApi'

/** Posts in the home page preview. App choice. */
const PREVIEW = 3

/** Home page: the newest board posts and unread chat messages, linking to the Board. */
export function BoardPreview({ household, members }: { household: Household; members: Member[] }) {
   const posts = usePosts(household.id)
   const unread = useUnread(household.id).data?.count ?? 0
   const latest = (posts.data ?? []).slice(0, PREVIEW)
   const [now] = useState(() => new Date())
   const name = (id: string) => members.find((m) => m.id === id)?.fname ?? 'Someone who left'

   return (
      <section aria-labelledby='board-preview-heading' className='space-y-3'>
         <div className='flex flex-wrap items-baseline justify-between gap-2'>
            <h2 id='board-preview-heading' className='text-sm font-medium text-muted-foreground'>
               Latest on the board
            </h2>
            <Link to='/board' className='inline-flex items-center gap-1 rounded-md text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50'>
               Open the board
               <ArrowRight className='size-4' aria-hidden />
            </Link>
         </div>
         {unread > 0 && (
            <Link
               to='/board?tab=chat'
               className='flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm font-medium outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50'
            >
               <MessageCircle className='size-5 text-primary' aria-hidden />
               {unread} new {unread === 1 ? 'message' : 'messages'} in the chat
            </Link>
         )}
         {posts.isPending ? (
            <div className='h-20 animate-pulse rounded-2xl bg-muted' />
         ) : latest.length === 0 ? (
            <p className='rounded-2xl border border-dashed p-4 text-sm text-muted-foreground'>
               Nothing on the board yet. <Link to='/board' className='font-medium text-primary underline underline-offset-2'>Leave a note or ask a quick question.</Link>
            </p>
         ) : (
            <ul className='grid gap-3 sm:grid-cols-3'>
               {latest.map((p) => {
                  const Icon = p.pinned ? Pin : p.kind === 'poll' ? ListChecks : StickyNote
                  return (
                     <li key={p.id}>
                        <Link
                           to='/board'
                           className={cn(
                              'flex h-full flex-col gap-1.5 rounded-2xl border bg-card p-4 outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50',
                              p.pinned && 'border-primary/40',
                           )}
                        >
                           <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                              <Icon className='size-3.5' aria-hidden />
                              {p.pinned ? 'Pinned · ' : p.kind === 'poll' ? 'Poll · ' : ''}
                              {name(p.authorId)} · {relativeTime(p.createdAt, now)}
                           </span>
                           <span className='line-clamp-3 text-sm wrap-break-word'>{p.text}</span>
                           {p.poll?.open && <span className='mt-auto text-xs font-medium text-primary'>Vote now</span>}
                        </Link>
                     </li>
                  )
               })}
            </ul>
         )}
      </section>
   )
}
