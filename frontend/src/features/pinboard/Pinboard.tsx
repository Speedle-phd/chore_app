import { useEffect, useId, useState } from 'react'
import { RefreshCw, StickyNote } from 'lucide-react'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { selectClass } from '@/features/calendar/styles'
import type { Household, Member } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'
import { cn } from '@/lib/utils'
import { Composer } from './Composer'
import { usePosts } from './pinboardApi'
import { PostCard } from './PostCard'
import { markSeen } from './seen'

/** Posts shown before "Show all". App choice. */
const PREVIEW = 6

/** "now" that moves on every minute, so "5 min ago" stays true. */
function useNow() {
   const [now, setNow] = useState(() => new Date())
   useEffect(() => {
      const timer = window.setInterval(() => setNow(new Date()), 60_000)
      return () => window.clearInterval(timer)
   }, [])
   return now
}

/** Home page: notes and polls for the household. */
export function Pinboard({ household, members }: { household: Household; members: Member[] }) {
   const id = useId()
   const posts = usePosts(household.id)
   const now = useNow()
   const [showAll, setShowAll] = useState(false)
   const me = members.find((m) => m.isMe)
   // Anyone may vote for profiles (no login), e.g. a child who isn't on a phone.
   const voters = members.filter((m) => m.isMe || m.kind === 'profile')
   const [voterId, setVoterId] = useState<string | null>(null)
   const voter = voters.find((m) => m.id === voterId) ?? me
   const manager = canManage(household.role)

   // Looking at the board marks everything on it as seen (header dot), also posts arriving live.
   const newest = posts.data?.reduce((max, p) => (p.createdAt > max ? p.createdAt : max), '')
   useEffect(() => {
      if (newest) markSeen(household.id, newest)
   }, [household.id, newest])

   const list = posts.data ?? []
   const shown = showAll ? list : list.slice(0, PREVIEW)
   const hasPolls = list.some((p) => p.poll?.open)

   return (
      <section aria-labelledby={`${id}-title`} className='space-y-4'>
         <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
               <h2 id={`${id}-title`} className='text-lg font-semibold'>
                  Pinboard
               </h2>
               <p className='text-sm text-muted-foreground'>Notes and quick polls for everyone in {household.name}.</p>
            </div>
            {hasPolls && voters.length > 1 && (
               <label className='flex items-center gap-2 text-sm'>
                  Voting as
                  <select className={cn(selectClass, 'w-auto')} value={voter?.id ?? ''} onChange={(e) => setVoterId(e.target.value)}>
                     {voters.map((m) => (
                        <option key={m.id} value={m.id}>
                           {m.isMe ? `${m.fname} (you)` : m.fname}
                        </option>
                     ))}
                  </select>
               </label>
            )}
         </div>

         <Composer householdId={household.id} />

         {posts.isPending ? (
            <div role='status' className='space-y-3'>
               <span className='sr-only'>Loading the pinboard…</span>
               <div className='h-24 animate-pulse rounded-2xl bg-muted' />
               <div className='h-24 animate-pulse rounded-2xl bg-muted' />
            </div>
         ) : posts.isError ? (
            <div className='flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm'>
               <span>Couldn’t load the pinboard: {apiError(posts.error).message}</span>
               <Button variant='outline' size='sm' onClick={() => void posts.refetch()}>
                  <RefreshCw />
                  Try again
               </Button>
            </div>
         ) : list.length === 0 ? (
            <p className='flex items-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground'>
               <StickyNote className='size-4 shrink-0' aria-hidden />
               Nothing on the board yet. Leave a note or ask a quick question.
            </p>
         ) : (
            <>
               <ul className='grid items-start gap-3 md:grid-cols-2'>
                  {shown.map((post) => (
                     <li key={post.id}>
                        <PostCard householdId={household.id} post={post} members={members} voterId={voter?.id} manager={manager} now={now} />
                     </li>
                  ))}
               </ul>
               {list.length > PREVIEW && (
                  <Button variant='outline' onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                     {showAll ? 'Show fewer' : `Show all ${list.length}`}
                  </Button>
               )}
            </>
         )}
      </section>
   )
}
