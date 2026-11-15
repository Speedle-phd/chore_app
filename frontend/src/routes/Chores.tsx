import { useMemo, useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import { CalendarCheck, ClipboardList, PartyPopper, Pencil, Plus, RefreshCw, Repeat, WifiOff } from 'lucide-react'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AvatarStack } from '@/features/calendar/AvatarStack'
import {
   useCalendarItems,
   useChoreAgenda,
   type CalendarInstance,
   type ChoreInfo,
} from '@/features/calendar/calendarApi'
import { ChangeOccurrenceDialog } from '@/features/calendar/ChangeOccurrenceDialog'
import { ItemDialog, type Draft } from '@/features/calendar/ItemDialog'
import { OccurrenceDialog } from '@/features/calendar/OccurrenceDialog'
import { describeRepeat } from '@/features/calendar/recurrence'
import { nextHourSlot, viewerTimeZone } from '@/features/calendar/time'
import { ChoreCard, EffortDots } from '@/features/chores/ChoreCard'
import { dateOf, dayLabel, isMine } from '@/features/chores/format'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { canDeleteCalendarItem } from '@/features/households/permissions'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { usePageMeta } from './usePageMeta'

type ChoreInstance = CalendarInstance & { chore: ChoreInfo }
const chores = (list: CalendarInstance[]) => list.filter((i): i is ChoreInstance => i.chore !== null)

const Chores = () => {
   const meta = usePageMeta('/chores')
   const household = useHousehold()
   const members = useMembers(household.id)
   const agenda = useChoreAgenda(household.id)
   const library = useCalendarItems(household.id, 'chore')
   const [storedOnlyMine, setOnlyMine] = useLocalStorage('chores-only-mine', false)
   const onlyMine = storedOnlyMine === true

   const [draft, setDraft] = useState<Draft | null>(null)
   const [editingId, setEditingId] = useState<string | null>(null)
   const [selected, setSelected] = useState<CalendarInstance | null>(null)
   const [changing, setChanging] = useState<CalendarInstance | null>(null)

   const zone = viewerTimeZone()
   const memberList = useMemo(() => members.data ?? [], [members.data])
   const me = memberList.find((m) => m.isMe)
   const canDelete = (createdBy: string) => canDeleteCalendarItem(household.role, createdBy === me?.id)
   const filter = (list: CalendarInstance[]) => chores(list).filter((i) => !onlyMine || isMine(i, me?.id))

   const data = agenda.data
   const overdue = data ? filter(data.overdue) : []
   const today = data ? filter(data.today) : []
   const upcoming = data ? filter(data.upcoming) : []
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

         <Tabs defaultValue='todo'>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
               <TabsList>
                  <TabsTrigger value='todo'>To do</TabsTrigger>
                  <TabsTrigger value='all'>All chores</TabsTrigger>
               </TabsList>
               <label className='flex items-center gap-2 text-sm'>
                  <input
                     type='checkbox'
                     className='size-4 accent-primary'
                     checked={onlyMine}
                     onChange={(e) => setOnlyMine(e.target.checked)}
                  />
                  Only mine
               </label>
            </div>

            <TabsContent value='todo' className='space-y-8'>
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
                              Nothing {onlyMine ? 'for you ' : ''}today.
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
                  <ul className='divide-y rounded-xl border bg-card'>
                     {library.data
                        .filter((item) => !onlyMine || item.memberIds.length === 0 || item.memberIds.includes(me?.id ?? ''))
                        .map((item) => {
                           const people = item.memberIds.flatMap((id) => memberList.find((m) => m.id === id) ?? [])
                           return (
                              <li key={item.id} className='flex flex-wrap items-center gap-3 p-3'>
                                 <div className='min-w-0 flex-1'>
                                    <p className='truncate font-medium'>{item.title}</p>
                                    <p className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground'>
                                       <span className='flex items-center gap-1'>
                                          {item.rrule || item.afterDays ? (
                                             <Repeat className='size-3.5' aria-hidden />
                                          ) : (
                                             <CalendarCheck className='size-3.5' aria-hidden />
                                          )}
                                          {describeRepeat(item.rrule, item.timezone, item.afterDays)}
                                       </span>
                                       <EffortDots effort={item.chore.effort} />
                                       <span>
                                          {item.chore.assignmentMode === 'everyone'
                                             ? 'Each of them'
                                             : item.chore.rotation
                                               ? 'Taking turns'
                                               : 'Any one of them'}
                                       </span>
                                    </p>
                                 </div>
                                 <AvatarStack people={people} max={4} />
                                 <Button variant='ghost' size='sm' onClick={() => setEditingId(item.id)} aria-label={`Edit “${item.title}”`}>
                                    <Pencil />
                                    Edit
                                 </Button>
                              </li>
                           )
                        })}
                  </ul>
               )}
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
