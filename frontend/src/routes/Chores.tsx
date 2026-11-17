import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Temporal } from 'temporal-polyfill'
import { ClipboardList, PartyPopper, Plane, Plus, RefreshCw, WifiOff, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
   useCalendarItems,
   useChangeOccurrence,
   useChoreAgenda,
   type CalendarInstance,
   type ChoreInfo,
} from '@/features/calendar/calendarApi'
import { ChangeOccurrenceDialog } from '@/features/calendar/ChangeOccurrenceDialog'
import { ItemDialog, type Draft } from '@/features/calendar/ItemDialog'
import { OccurrenceDialog } from '@/features/calendar/OccurrenceDialog'
import { nextHourSlot, viewerTimeZone } from '@/features/calendar/time'
import { ChoreCard } from '@/features/chores/ChoreCard'
import { ChoreLibrary } from '@/features/chores/ChoreLibrary'
import { StatsView } from '@/features/stats/StatsView'
import { useRewards } from '@/features/rewards/rewardsApi'
import { RewardsView } from '@/features/rewards/RewardsView'
import { YourWeek } from '@/features/stats/YourWeek'
import { dateOf, dayLabel, isForAny } from '@/features/chores/format'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { PeopleFilter } from '@/features/households/PeopleFilter'
import { canDeleteCalendarItem, canManage } from '@/features/households/permissions'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { usePageMeta } from './usePageMeta'

type ChoreInstance = CalendarInstance & { chore: ChoreInfo }
const TABS = ['todo', 'all', 'stats', 'rewards'] as const
const chores = (list: CalendarInstance[]) => list.filter((i): i is ChoreInstance => i.chore !== null)

const Chores = () => {
   const meta = usePageMeta('/chores')
   const household = useHousehold()
   const members = useMembers(household.id)
   const agenda = useChoreAgenda(household.id)
   const library = useCalendarItems(household.id, 'chore')
   // Whose chores to show, per household and device; nobody selected = everyone.
   const [storedPeople, setPeople] = useLocalStorage(`chores-people-${household.id}`, null)
   // The former "Only mine" switch carries over once: as "just me".
   const [legacyOnlyMine] = useLocalStorage('chores-only-mine', false)

   const [draft, setDraft] = useState<Draft | null>(null)
   const [editingId, setEditingId] = useState<string | null>(null)
   const [clicked, setSelected] = useState<CalendarInstance | null>(null)
   // The tab is in the URL (/chores?tab=stats), so it can be linked and survives a reload.
   const [params, setParams] = useSearchParams()
   const tab = TABS.find((t) => t === params.get('tab')) ?? 'todo'
   const [changing, setChanging] = useState<CalendarInstance | null>(null)
   // Managers see how many reward requests wait for them on the tab.
   const rewards = useRewards(household.id)
   const waiting = canManage(household.role) && rewards.data?.enabled ? rewards.data.pending.length : 0

   const zone = viewerTimeZone()
   const memberList = useMemo(() => members.data ?? [], [members.data])
   const me = memberList.find((m) => m.isMe)
   const canDelete = (createdBy: string) => canDeleteCalendarItem(household.role, createdBy === me?.id)
   const people: string[] = (
      Array.isArray(storedPeople) ? storedPeople.filter((id): id is string => typeof id === 'string') : legacyOnlyMine === true && me ? [me.id] : []
   ).filter((id) => memberList.some((m) => m.id === id))
   const filtered = people.length > 0
   const filter = (list: CalendarInstance[]) => chores(list).filter((i) => isForAny(i, people))

   const data = agenda.data
   // The open dialog reads the occurrence from the agenda, so marking it done/undo updates it.
   const selected = clicked && ((data ? [...data.overdue, ...data.today, ...data.upcoming] : []).find((i) => i.id === clicked.id) ?? clicked)
   const overdue = data ? filter(data.overdue) : []
   const today = data ? filter(data.today) : []
   const upcoming = data ? filter(data.upcoming) : []
   // Vacation clashes with a suggestion, across overdue, today and the next 7 days.
   const clashes = [...overdue, ...today, ...upcoming].filter((i) => i.chore.conflict?.suggestion?.length)
   const change = useChangeOccurrence(household.id)
   const [accepting, setAccepting] = useState(false)
   const acceptAll = async () => {
      setAccepting(true)
      let failed = 0
      for (const i of clashes) {
         try {
            await change.mutateAsync({
               ref: { itemId: i.itemId, originalStart: i.originalStart },
               scope: 'this',
               change: { memberIds: i.chore.conflict?.suggestion ?? [] },
            })
         } catch {
            failed++
         }
      }
      setAccepting(false)
      if (failed) toast.error(`${failed} of ${clashes.length} couldn’t be reassigned.`)
      else toast.success(`Reassigned ${clashes.length} ${clashes.length === 1 ? 'chore' : 'chores'}`)
   }
   const upcomingByDay = new Map<string, ChoreInstance[]>()
   for (const i of upcoming) upcomingByDay.set(dateOf(i, zone), [...(upcomingByDay.get(dateOf(i, zone)) ?? []), i])

   const addChore = () => setDraft({ ...nextHourSlot(Temporal.Now.instant(), zone), allDay: false, kind: 'chore' })
   const card = (i: ChoreInstance) => (
      <ChoreCard
         key={i.id}
         householdId={household.id}
         instance={i}
         members={memberList}
         role={household.role}
         today={data?.date ?? ''}
         zone={zone}
         onOpen={setSelected}
      />
   )

   return (
      <>
         <PageHeader
            title={meta?.label ?? 'Chores'}
            description={meta?.subtitle}
            Icon={meta?.Icon}
            action={
               <Button onClick={addChore}>
                  <Plus />
                  Add chore
               </Button>
            }
         />

         <Tabs value={tab} onValueChange={(v) => setParams(v === 'todo' ? {} : { tab: String(v) }, { replace: true })}>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
               <TabsList>
                  <TabsTrigger value='todo'>To do</TabsTrigger>
                  <TabsTrigger value='all'>All chores</TabsTrigger>
                  <TabsTrigger value='stats'>Stats</TabsTrigger>
                  <TabsTrigger value='rewards'>
                     Rewards
                     {waiting > 0 && (
                        <span className='grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-semibold text-primary-foreground'>
                           {waiting}
                           <span className='sr-only'> waiting for approval</span>
                        </span>
                     )}
                  </TabsTrigger>
               </TabsList>
            </div>
            {/* Stats and rewards always cover everyone; the filter applies to To do and All chores. */}
            {(tab === 'todo' || tab === 'all') && (
               <div className='mb-6 flex flex-wrap items-center gap-x-4 gap-y-2'>
                  <PeopleFilter members={memberList} value={people} onChange={setPeople} />
                  {filtered && (
                     <Button variant='ghost' size='sm' onClick={() => setPeople([])}>
                        <X />
                        Everyone
                     </Button>
                  )}
               </div>
            )}

            <TabsContent value='todo' className='space-y-8'>
               <YourWeek householdId={household.id} me={me} />
               {agenda.isPending ? (
                  <div className='space-y-3' aria-busy='true' aria-label='Loading chores'>
                     {[0, 1, 2].map((i) => (
                        <div key={i} className='h-16 animate-pulse rounded-xl bg-muted' />
                     ))}
                  </div>
               ) : agenda.isError ? (
                  <EmptyState Icon={WifiOff} title='Couldn’t load chores' description={apiError(agenda.error).message}>
                     <Button variant='outline' onClick={() => void agenda.refetch()}>
                        <RefreshCw />
                        Try again
                     </Button>
                  </EmptyState>
               ) : (
                  <>
                     {clashes.length > 0 && (
                        <div
                           role='status'
                           className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm'
                        >
                           <span className='flex items-center gap-2'>
                              <Plane className='size-4 text-primary' aria-hidden />
                              {clashes.length} {clashes.length === 1 ? 'chore falls' : 'chores fall'} on someone’s vacation. Each
                              card shows a suggestion.
                           </span>
                           <Button size='sm' disabled={accepting} onClick={() => void acceptAll()}>
                              {accepting ? 'Reassigning…' : 'Accept all suggestions'}
                           </Button>
                        </div>
                     )}
                     {overdue.length > 0 && (
                        <section aria-labelledby='chores-overdue'>
                           <h2 id='chores-overdue' className='mb-3 flex items-center gap-2 text-base font-semibold'>
                              Overdue
                              <span className='rounded-full bg-destructive/10 px-2 text-sm font-medium'>{overdue.length}</span>
                           </h2>
                           <ul className='space-y-2'>{overdue.map(card)}</ul>
                        </section>
                     )}

                     <section aria-labelledby='chores-today'>
                        <h2 id='chores-today' className='mb-3 text-base font-semibold'>
                           Today
                        </h2>
                        {today.length ? (
                           <ul className='space-y-2'>{today.map(card)}</ul>
                        ) : (
                           <p className='flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground'>
                              <PartyPopper className='size-4' aria-hidden />
                              {filtered ? 'Nothing today for the selected people.' : 'Nothing today.'}
                           </p>
                        )}
                     </section>

                     <section aria-labelledby='chores-upcoming'>
                        <h2 id='chores-upcoming' className='mb-3 text-base font-semibold'>
                           Next 7 days
                        </h2>
                        {upcoming.length ? (
                           <div className='space-y-4'>
                              {[...upcomingByDay].map(([date, list]) => (
                                 <div key={date}>
                                    <h3 className='mb-2 text-sm font-medium text-muted-foreground'>{dayLabel(date, data?.date ?? date)}</h3>
                                    <ul className='space-y-2'>{list.map(card)}</ul>
                                 </div>
                              ))}
                           </div>
                        ) : (
                           <p className='rounded-xl border border-dashed p-4 text-sm text-muted-foreground'>Nothing planned.</p>
                        )}
                     </section>
                  </>
               )}
            </TabsContent>

            <TabsContent value='all'>
               {library.isPending ? (
                  <div className='h-32 animate-pulse rounded-xl bg-muted' aria-busy='true' aria-label='Loading chores' />
               ) : library.isError ? (
                  <EmptyState Icon={WifiOff} title='Couldn’t load chores' description={apiError(library.error).message}>
                     <Button variant='outline' onClick={() => void library.refetch()}>
                        <RefreshCw />
                        Try again
                     </Button>
                  </EmptyState>
               ) : library.data.length === 0 ? (
                  <EmptyState Icon={ClipboardList} title='No chores yet' description='Add the first one: what needs doing, how often, and by whom.'>
                     <Button onClick={addChore}>
                        <Plus />
                        Add chore
                     </Button>
                  </EmptyState>
               ) : (
                  <ChoreLibrary
                     householdId={household.id}
                     items={library.data.filter((item) => isForAny(item, people))}
                     members={memberList}
                     canArchive={canDelete}
                     onEdit={setEditingId}
                  />
               )}
            </TabsContent>
            <TabsContent value='stats'>
               <StatsView householdId={household.id} members={memberList} />
            </TabsContent>
            <TabsContent value='rewards'>
               <RewardsView household={household} members={memberList} />
            </TabsContent>
         </Tabs>

         <ItemDialog
            householdId={household.id}
            members={memberList}
            itemId={editingId}
            draft={draft}
            canDelete={canDelete}
            onClose={() => {
               setDraft(null)
               setEditingId(null)
            }}
         />
         <OccurrenceDialog
            householdId={household.id}
            instance={selected}
            members={memberList}
            role={household.role}
            canDelete={canDelete}
            onClose={() => setSelected(null)}
            onEdit={(itemId) => {
               setSelected(null)
               setEditingId(itemId)
            }}
            onChange={(instance) => {
               setSelected(null)
               setChanging(instance)
            }}
         />
         <ChangeOccurrenceDialog householdId={household.id} instance={changing} members={memberList} onClose={() => setChanging(null)} />
      </>
   )
}

export default Chores
