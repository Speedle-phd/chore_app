import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Cake, Check, CircleSlash, FileUp, Flag, Plane, RefreshCw, Repeat } from 'lucide-react'
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
import { CalendarFilters, type Filters } from '@/features/calendar/CalendarFilters'
import { ALL_KINDS, KINDS, visibleKinds } from '@/features/calendar/kinds'
import { OccurrenceDialog } from '@/features/calendar/OccurrenceDialog'
import { ScopeDialog } from '@/features/calendar/ScopeDialog'
import { instantToParts, nextHourSlot, viewerTimeZone } from '@/features/calendar/time'
import { useHousehold, useMembers, type Member } from '@/features/households/householdsApi'
import { ImportDialog } from '@/features/ical/ImportDialog'
import { STATES, useHolidays, type Holiday, type StateCode } from '@/features/holidays/holidaysApi'
import { canDeleteCalendarItem } from '@/features/households/permissions'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { usePageMeta } from './usePageMeta'

/** 12- or 24-hour clock as the viewer's system uses it ("10:00" vs "10:00 AM", never "10a"). */
const hour12 = /^h1[12]$/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '')
const timeFormat = { hour: 'numeric', minute: '2-digit', hour12, meridiem: hour12 ? 'short' : false } as const
const slotFormat = { hour: 'numeric', minute: '2-digit', hour12, omitZeroMinute: hour12, meridiem: hour12 ? 'short' : false } as const

/** Phones start in the list view; a month grid is unreadable at that width. */
const initialView = () => (window.matchMedia('(max-width: 640px)').matches ? 'listWeek' : 'dayGridMonth')

const toEvent = (instance: CalendarInstance): EventInput => ({
   id: instance.id,
   title: instance.title,
   start: instance.start,
   end: instance.end,
   allDay: instance.allDay,
   color: instance.color ?? KINDS[instance.kind].color,
   // Birthdays from member profiles are edited in the profile; archived chores are history.
   editable: instance.source === 'entry' && !instance.archived,
   extendedProps: { instance },
   sortGroup: 1,
})

/** A public holiday: read-only, muted, all day, shown before the household's entries. */
const toHolidayEvent = (holiday: Holiday, state: StateCode): EventInput => ({
   id: `holiday-${holiday.date}-${holiday.id}`,
   title: holiday.name,
   start: holiday.date,
   allDay: true,
   editable: false,
   // Neutral grey; the calendar tints the box and mixes the text from it (readable in every theme).
   color: 'var(--muted-foreground)',
   extendedProps: { holiday, regionName: STATES[state] },
   sortGroup: 0,
})

function HolidayContent({ holiday, regionName, titleClass }: { holiday: Holiday; regionName: string; titleClass: string }) {
   return (
      <span className={cn(titleClass, 'flex min-w-0 items-center gap-1 font-normal')}>
         <Flag aria-label='Public holiday' className='size-3 shrink-0' />
         <span className='truncate' title={holiday.partial ? `${holiday.name} · only in parts of ${regionName}` : holiday.name}>
            {holiday.name}
            {holiday.partial && <span className='opacity-80'> · only in parts of {regionName}</span>}
         </span>
      </span>
   )
}

type EventContentProps = EventDisplayInfo & { people: Map<string, Member> }

function EventContent({ event, view, timeText, timeClass, titleClass, isNarrow, isShort, people }: EventContentProps) {
   const holiday = event.extendedProps.holiday as Holiday | undefined
   if (holiday) return <HolidayContent holiday={holiday} regionName={String(event.extendedProps.regionName)} titleClass={titleClass} />
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
            {instance.chore?.conflict && <Plane aria-label='Someone is away' className='size-3 shrink-0' />}
            {instance.kind === 'birthday' && <Cake aria-hidden className='size-3 shrink-0' />}
            <span className={cn('truncate', (state === 'done' || state === 'skipped') && 'line-through opacity-70')}>
               {event.title}
               {instance.source === 'entry' && instance.age !== null && <span className='font-normal opacity-80'> · {instance.age}</span>}
            </span>
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
   const [viewType, setViewType] = useState(initialView)
   // Remembered per household in this browser.
   const [storedFilters, storeFilters] = useLocalStorage(`calendar-filters-${household.id}`, {
      kinds: ALL_KINDS,
      memberIds: [] as string[],
      seen: ALL_KINDS,
      holidays: true,
   })
   const filters: Filters = {
      kinds: visibleKinds(storedFilters),
      memberIds: storedFilters?.memberIds ?? [],
      holidays: storedFilters?.holidays ?? true,
   }
   // Remember which kinds existed, so kinds added later start visible (visibleKinds).
   const setFilters = (next: Filters) => storeFilters({ ...next, seen: ALL_KINDS })
   const calendar = useCalendar(household.id, range, {
      kinds: filters.kinds.length < ALL_KINDS.length ? filters.kinds : [],
      memberIds: filters.memberIds,
   })
   const state = household.region.state
   const holidays = useHolidays(household.id, filters.holidays ? state : null, range)
   const events = useMemo(
      () => [...(calendar.data ?? []).map(toEvent), ...(state && filters.holidays ? (holidays.data ?? []).map((h) => toHolidayEvent(h, state)) : [])],
      [calendar.data, holidays.data, state, filters.holidays],
   )
   const change = useChangeOccurrence(household.id)
   const preview = useCalendarPreview(household.id)

   const [draft, setDraft] = useState<Draft | null>(null)
   const [editingId, setEditingId] = useState<string | null>(null)
   // Keep the clicked occurrence's id and read it from the query, so the open dialog follows
   // every change (done/undo, live updates); the copy is only a fallback if it leaves the range.
   const [clicked, setSelected] = useState<CalendarInstance | null>(null)
   const selected = clicked && ((calendar.data ?? []).find((i) => i.id === clicked.id) ?? clicked)
   const [changing, setChanging] = useState<CalendarInstance | null>(null)
   const [drop, setDrop] = useState<PendingDrop | null>(null)
   const [importing, setImporting] = useState(false)
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
            action={
               <Button variant='outline' onClick={() => setImporting(true)}>
                  <FileUp />
                  Import .ics
               </Button>
            }
         />
         {importing && <ImportDialog householdId={household.id} onClose={() => setImporting(false)} />}

         <CalendarFilters
            value={{ ...filters, memberIds: filters.memberIds.filter((id) => memberList.some((m) => m.id === id)) }}
            onChange={setFilters}
            members={memberList}
            hasHolidays={state !== null}
         />

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
               initialView={viewType}
               // Week/day fit the screen and scroll inside (opening at 07:00); month, list and year grow with their content.
               height={viewType.startsWith('timeGrid') ? 'clamp(34rem, calc(100dvh - 10rem), 60rem)' : 'auto'}
               scrollTime='07:00:00'
               // Overlapping entries share the column width instead of stacking on top of each other.
               slotEventOverlap={false}
               eventTimeFormat={timeFormat}
               slotHeaderFormat={slotFormat}
               firstDay={1}
               nowIndicator
               navLinks
               dayMaxEvents={4}
               editable
               eventResizableFromStart
               selectable
               selectMirror
               dragRevertDuration={200}
               addButton={{ text: 'Add', hint: 'Add an entry', isPrimary: true, click: openNew }}
               events={events}
               // Public holidays first in a day, then the usual order.
               eventOrder='sortGroup,start,-duration,allDay,title'
               eventContent={(arg) => <EventContent {...arg} people={people} />}
               eventClick={(info) => {
                  info.jsEvent.preventDefault()
                  const instance = info.event.extendedProps.instance as CalendarInstance | undefined
                  // Holidays are read-only and say everything in their title.
                  if (instance) setSelected(instance)
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
               datesSet={({ start, end, view }) => {
                  setViewType(view.type)
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
