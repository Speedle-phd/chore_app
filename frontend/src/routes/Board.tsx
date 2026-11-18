import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Chat } from '@/features/chat/Chat'
import { useUnread } from '@/features/chat/chatApi'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { Pinboard } from '@/features/pinboard/Pinboard'
import { usePostsUnread } from '@/features/pinboard/pinboardApi'
import { usePageMeta } from './usePageMeta'

const TABS = ['pinboard', 'chat'] as const

/** Count on a tab ("3 unread"); the word is for screen readers. */
const TabCount = ({ count, label }: { count: number; label: string }) => (
   <span className='grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-semibold text-primary-foreground'>
      {count > 99 ? '99+' : count}
      <span className='sr-only'> {label}</span>
   </span>
)

/** Board: the household's pinboard (notes, polls) and chat, as tabs in the URL (?tab=chat). */
const Board = () => {
   const meta = usePageMeta('/board')
   const household = useHousehold()
   const members = useMembers(household.id)
   const memberList = useMemo(() => members.data ?? [], [members.data])
   const unread = useUnread(household.id).data?.count ?? 0
   const newPosts = usePostsUnread(household.id).data?.count ?? 0
   const [params, setParams] = useSearchParams()
   const tab = TABS.find((t) => t === params.get('tab')) ?? 'pinboard'

   return (
      <>
         <PageHeader title={meta?.label ?? 'Board'} description={meta?.subtitle} Icon={meta?.Icon} />
         <Tabs value={tab} onValueChange={(v) => setParams(v === 'pinboard' ? {} : { tab: String(v) }, { replace: true })}>
            <TabsList className='mb-5'>
               <TabsTrigger value='pinboard'>
                  Pinboard
                  {newPosts > 0 && tab !== 'pinboard' && <TabCount count={newPosts} label='new' />}
               </TabsTrigger>
               <TabsTrigger value='chat'>
                  Chat
                  {unread > 0 && tab !== 'chat' && <TabCount count={unread} label='unread' />}
               </TabsTrigger>
            </TabsList>
            <TabsContent value='pinboard'>
               <Pinboard household={household} members={memberList} />
            </TabsContent>
            <TabsContent value='chat'>
               <Chat household={household} members={memberList} />
            </TabsContent>
         </Tabs>
      </>
   )
}

export default Board
