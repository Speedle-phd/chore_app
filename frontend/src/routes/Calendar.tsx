import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, CircleSlash, RefreshCw, Repeat } from 'lucide-react'
import type { EventDisplayInfo, EventInput } from '@fullcalendar/react'
import { Temporal } from 'temporal-polyfill'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { EventCalendar } from '@/components/event-calendar'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AvatarStack } from '@/features/calendar/AvatarStack'
import {
   useCalendar,
   useCalendarPreview,
   useChangeOccurrence,
   type CalendarInstance,
   type CalendarRange,
   type OccurrenceChange,
   type Scope,
} from '@/features/calendar/calendarApi'
import { ChangeOccurrenceDialog } from '@/features/calendar/ChangeOccurrenceDialog'
import { ItemDialog, type Draft } from '@/features/calendar/ItemDialog'
import { KINDS } from '@/features/calendar/kinds'
import { OccurrenceDialog } from '@/features/calendar/OccurrenceDialog'
import { ScopeDialog } from '@/features/calendar/ScopeDialog'
import { instantToParts, nextHourSlot, viewerTimeZone } from '@/features/calendar/time'
import { useHousehold, useMembers, type Member } from '@/features/households/householdsApi'
import { canDeleteCalendarItem } from '@/features/households/permissions'
import { usePageMeta } from './usePageMeta'

/** Phones start in the list view; a month grid is unreadable at that width. */
const initialView = () => (window.matchMedia('(max-width: 640px)').matches ? 'listWeek' : 'dayGridMonth')

const toEvent = (instance: CalendarInstance): EventInput => ({
   id: instance.id,
   title: instance.title,
   start: instance.start,
   end: instance.end,
   allDay: instance.allDay,
   color: instance.color ?? KINDS[instance.kind].color,
   extendedProps: { instance },
})

type EventContentProps = EventDisplayInfo & { people: Map<string, Member> }

function EventContent({ event, view, timeText, timeClass, titleClass, isNarrow, isShort, people }: EventContentProps) {
   const instance = event.extendedProps.instance as CalendarInstance | undefined
   // The placeholder drawn while selecting a time range has no entry behind it.
   if (!instance) {
      return (
         <>
            {timeText && <span className={timeClass}>{timeText}</span>}
            <span className={titleClass}>{event.title || 'New entry'}</span>
         </>
      )
   }
   const assignees = instance.memberIds.flatMap((id) => people.get(id) ?? [])
   const state = instance.chore?.state
   // Tall time-grid blocks: avatars sit in the bottom corner so they never squeeze the text.
   const cornerAvatars = view.type.startsWith('timeGrid') && !event.allDay && !isShort
   return (
      <>
         {timeText && <span className={timeClass}>{timeText}</span>}
         <span className={cn(titleClass, 'flex min-w-0 items-center gap-1')}>
            {state === 'done' && <Check aria-label='Done' className='size-3 shrink-0' />}
            {state === 'skipped' && <CircleSlash aria-label='Skipped' className='size-3 shrink-0' />}
            {instance.chore?.overdue && <AlertTriangle aria-label='Overdue' className='size-3 shrink-0 text-destructive' />}
            <span className={cn('truncate', (state === 'done' || state === 'skipped') && 'line-through opacity-70')}>{event.title}</span>
            {instance.recurring && <Repeat aria-label='Repeats' className='size-3 shrink-0 opacity-70' />}
         </span>
         {!isNarrow && (
            <AvatarStack
               people={assignees}
               size={cornerAvatars ? 'sm' : 'xs'}
               className={cornerAvatars ? 'absolute end-1 bottom-1' : 'ms-auto ps-1'}
            />
         )}
      </>
   )
}

/** A drag or resize waiting for "which occurrences?"; `undo` puts the preview back. */
type PendingDrop = { instance: CalendarInstance; change: OccurrenceChange; undo: () => void }

type MovedEvent = {
   allDay: boolean
   startStr: string
   endStr: string
   start: Date | null
   end: Date | null
   extendedProps: Record<string, unknown>
}

/** The moved event in the API's terms (dates for all-day, instants otherwise). */
function movedTimes(event: MovedEvent): { start: string; end: string } | null {
   if (event.allDay) return event.endStr ? { start: event.startStr.slice(0, 10), end: event.endStr.slice(0, 10) } : null
   return event.start && event.end ? { start: event.start.toISOString(), end: event.end.toISOString() } : null
}

const Calendar = () => {
   const meta = usePageMeta('/calendar')
   const household = useHousehold()
   const members = useMembers(household.id)
   const [range, setRange] = useState<CalendarRange | null>(null)
   const calendar = useCalendar(household.id, range)
   const change = useChangeOccurrence(household.id)
   const preview = useCalendarPreview(household.id)

   const [draft, setDraft] = useState<Draft | null>(null)
   const [editingId, setEditingId] = useState<string | null>(null)
   const [selected, setSelected] = useState<CalendarInstance | null>(null)
   const [changing, setChanging] = useState<CalendarInstance | null>(null)
   const [drop, setDrop] = useState<PendingDrop | null>(null)
   // The highlighted range stays as a preview while the new-entry dialog is open.
   const clearSelection = useRef<() => void>(() => {})

   const memberList = useMemo(() => members.data ?? [], [members.data])
   const people = useMemo(() => new Map(memberList.map((m) => [m.id, m])), [memberList])
   const myId = memberList.find((m) => m.isMe)?.id
   const canDelete = (createdBy: string) => canDeleteCalendarItem(household.role, createdBy === myId)

   const sendDrop = (pending: PendingDrop, scope: Scope) =>
      change.mutate(
         { ref: { itemId: pending.instance.itemId, originalStart: pending.instance.originalStart }, scope, change: pending.change },
         {
            onSuccess: () => setDrop(null),
            onError: (e) => {
               pending.undo()
               setDrop(null)
               toast.error(apiError(e).message)
            },
         },
      )

   const onMoved = (info: { event: MovedEvent; oldEvent?: { allDay: boolean }; revert: () => void }) => {
      const instance = info.event.extendedProps.instance as CalendarInstance
      const times = movedTimes(info.event)
      if (!times || (info.oldEvent && info.oldEvent.allDay !== info.event.allDay)) {
         info.revert()
         toast.info('To switch between all-day and a time, edit the entry.')
         return
      }
      // Show the new place at once; the server answer (or a failure) settles it.
      const pending = { instance, change: times, undo: preview(instance.id, times) }
      if (instance.recurring) setDrop(pending)
      else sendDrop(pending, 'this')
   }

   const openNew = () => {
      const slot = nextHourSlot(Temporal.Now.instant(), viewerTimeZone())
      setDraft({ allDay: false, ...slot })
   }

   return (
      <>
         <PageHeader
            title={meta?.label ?? 'Calendar'}
            description={`Chores, events and birthdays of ${household.name}`}
            Icon={meta?.Icon}
         />

         <ul className='mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground' aria-label='Legend'>
            {Object.entries(KINDS).map(([kind, { label, color }]) => (
               <li key={kind} className='flex items-center gap-2'>
                  <span className='size-2.5 rounded-full' style={{ background: color }} aria-hidden />
                  {label}
               </li>
            ))}
         </ul>

         {calendar.isError && (
            <div
               role='alert'
               className='mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm'
            >
               <span>Couldn’t load the calendar: {apiError(calendar.error).message}</span>
               <Button variant='outline' size='sm' onClick={() => void calendar.refetch()}>
                  <RefreshCw />
                  Try again
               </Button>
            </div>
         )}

         <div aria-busy={calendar.isFetching}>
            <EventCalendar
               initialView={initialView()}
               // Fits the screen; week/day views scroll inside and open at the start of the day.
               height='clamp(34rem, calc(100dvh - 10rem), 60rem)'
               scrollTime='07:00:00'
               firstDay={1}
               nowIndicator
               navLinks
               dayMaxEvents
               editable
               eventResizableFromStart
               selectable
               selectMirror
               dragRevertDuration={200}
               addButton={{ text: 'Add', hint: 'Add an entry', isPrimary: true, click: openNew }}
               events={(calendar.data ?? []).map(toEvent)}
               eventContent={(arg) => <EventContent {...arg} people={people} />}
               eventClick={(info) => {
                  info.jsEvent.preventDefault()
                  setSelected(info.event.extendedProps.instance as CalendarInstance)
               }}
               eventDrop={onMoved}
               eventResize={onMoved}
               select={(info) => {
                  clearSelection.current = () => info.view.calendar.unselect()
                  const zone = viewerTimeZone()
                  setDraft(
                     info.allDay
                        ? { allDay: true, start: { date: info.startStr, time: '09:00' }, end: { date: info.endStr, time: '10:00' } }
                        : {
                             allDay: false,
                             start: instantToParts(info.start.toISOString(), zone),
                             end: instantToParts(info.end.toISOString(), zone),
                          },
                  )
               }}
               datesSet={({ start, end }) => {
                  const next = { from: start.toISOString(), to: end.toISOString() }
                  setRange((prev) => (prev?.from === next.from && prev.to === next.to ? prev : next))
               }}
            />
         </div>

         <ItemDialog
            householdId={household.id}
            members={memberList}
            itemId={editingId}
            draft={draft}
            canDelete={canDelete}
            onClose={() => {
               clearSelection.current()
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
         <ChangeOccurrenceDialog
            householdId={household.id}
            instance={changing}
            members={memberList}
            onClose={() => setChanging(null)}
         />
         <ScopeDialog
            open={drop !== null}
            title='Move which occurrences?'
            description={drop ? `“${drop.instance.title}” repeats.` : undefined}
            scopes={['this', 'following', 'all']}
            confirmLabel='Move'
            isPending={change.isPending}
            onCancel={() => {
               drop?.undo()
               setDrop(null)
            }}
            onConfirm={(scope) => drop && sendDrop(drop, scope)}
         />
      </>
   )
}

export default Calendar
