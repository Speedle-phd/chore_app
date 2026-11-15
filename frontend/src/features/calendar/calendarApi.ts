import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { choreState } from './choreState'
import { viewerTimeZone } from './time'

export type CalendarKind = 'chore' | 'event' | 'birthday' | 'vacation'
export type AssignmentMode = 'anyone' | 'everyone'
export type CompletionStatus = 'done' | 'skipped'
export type ChoreState = 'open' | 'partial' | 'done' | 'skipped'

export type Completion = { memberId: string; status: CompletionStatus; at: string; by: string; note: string }
export type ChoreSettings = { effort: number; assignmentMode: AssignmentMode; rotation: boolean }

/** Chore part of an occurrence (server computes state/overdue for "now"). */
export type ChoreInfo = ChoreSettings & {
   afterDays: number | null
   state: ChoreState
   overdue: boolean
   completions: Completion[]
}

/** One concrete occurrence (server: backend/src/calendar/calendarViews.ts). */
export type CalendarInstance = {
   id: string
   itemId: string
   kind: CalendarKind
   title: string
   notes: string
   color: string | null
   allDay: boolean
   /** All-day: `YYYY-MM-DD` (end exclusive); timed: ISO date-time with offset. */
   start: string
   end: string
   originalStart: string
   /** For chores: the effective assignees (rotation and reassignment applied). */
   memberIds: string[]
   createdBy: string
   recurring: boolean
   overridden: boolean
   chore: ChoreInfo | null
}

/** A whole entry (series); times are local wall-clock in `timezone`. */
export type CalendarItem = {
   id: string
   kind: CalendarKind
   title: string
   notes: string
   color: string | null
   allDay: boolean
   start: string
   end: string
   timezone: string
   memberIds: string[]
   rrule: string | null
   afterDays: number | null
   exdates: string[]
   chore: ChoreSettings
   createdBy: string
   createdAt: string
   updatedAt: string
}

export type ItemInput = Pick<
   CalendarItem,
   'kind' | 'title' | 'notes' | 'allDay' | 'start' | 'end' | 'timezone' | 'memberIds' | 'rrule' | 'afterDays' | 'chore'
>

export type Scope = 'this' | 'following' | 'all'
/** All-day: `YYYY-MM-DD`; timed: ISO date-time with offset. */
export type OccurrenceChange = { start?: string; end?: string; memberIds?: string[] }
export type OccurrenceRef = { itemId: string; originalStart: string }

export type CalendarRange = { from: string; to: string }

export const calendarKey = (hid: string, range?: CalendarRange) =>
   range ? (['household', hid, 'calendar', range.from, range.to] as const) : (['household', hid, 'calendar'] as const)
export const calendarItemKey = (hid: string, id: string) => ['household', hid, 'calendar-item', id] as const
export const calendarItemsKey = (hid: string, kind: CalendarKind) => ['household', hid, 'calendar-items', kind] as const
export const choresKey = (hid: string) => ['household', hid, 'chores'] as const

export type ChoreAgenda = {
   /** Today in the viewer's zone, `YYYY-MM-DD`. */
   date: string
   overdue: CalendarInstance[]
   today: CalendarInstance[]
   upcoming: CalendarInstance[]
}

const itemsUrl = (hid: string) => `/households/${hid}/calendar-items`
const occurrenceUrl = (hid: string, { itemId, originalStart }: OccurrenceRef) =>
   `${itemsUrl(hid)}/${itemId}/occurrences/${encodeURIComponent(originalStart)}`

export function useCalendar(hid: string, range: CalendarRange | null) {
   return useQuery({
      queryKey: range ? calendarKey(hid, range) : calendarKey(hid),
      queryFn: async () =>
         (
            await api.get<CalendarInstance[]>(`/households/${hid}/calendar`, {
               params: { ...range, tz: viewerTimeZone() },
            })
         ).data,
      enabled: range !== null,
      // Keep the previous range on screen while the next one loads (no flicker when paging).
      placeholderData: keepPreviousData,
   })
}

/**
 * Shows a moved occurrence at its new place in every loaded range right away
 * (the calendar re-renders from this cache, so without it a drop snaps back
 * until the server answers). Returns an undo for cancel/failure.
 */
export function useCalendarPreview(hid: string) {
   const queryClient = useQueryClient()
   return (instanceId: string, patch: Pick<CalendarInstance, 'start' | 'end'>) => {
      const filter = { queryKey: calendarKey(hid) }
      const snapshot = queryClient.getQueriesData<CalendarInstance[]>(filter)
      queryClient.setQueriesData<CalendarInstance[]>(filter, (list) =>
         list?.map((i) => (i.id === instanceId ? { ...i, ...patch, overridden: true } : i)),
      )
      // A refetch already on its way would put the old position back.
      void queryClient.cancelQueries(filter, { revert: false })
      return () => {
         for (const [key, data] of snapshot) queryClient.setQueryData(key, data)
      }
   }
}

export function useCalendarItem(hid: string, id: string | null) {
   return useQuery({
      queryKey: calendarItemKey(hid, id ?? ''),
      queryFn: async () => (await api.get<CalendarItem>(`${itemsUrl(hid)}/${id}`)).data,
      enabled: id !== null,
   })
}

/** After any write: every loaded range, the chore agenda and lists are stale. */
function useRefreshCalendar(hid: string) {
   const queryClient = useQueryClient()
   return () =>
      Promise.all([
         queryClient.invalidateQueries({ queryKey: calendarKey(hid) }),
         queryClient.invalidateQueries({ queryKey: choresKey(hid) }),
         queryClient.invalidateQueries({ queryKey: ['household', hid, 'calendar-items'] }),
      ])
}

export function useCalendarItems(hid: string, kind: CalendarKind) {
   return useQuery({
      queryKey: calendarItemsKey(hid, kind),
      queryFn: async () => (await api.get<CalendarItem[]>(itemsUrl(hid), { params: { kind } })).data,
   })
}

/** Overdue, today and the next 7 days; refreshed every few minutes since "overdue" moves with time. */
export function useChoreAgenda(hid: string) {
   return useQuery({
      queryKey: choresKey(hid),
      queryFn: async () =>
         (await api.get<ChoreAgenda>(`/households/${hid}/chores`, { params: { tz: viewerTimeZone() } })).data,
      refetchInterval: 5 * 60_000,
   })
}

export type StatusChange = { ref: OccurrenceRef; status: CompletionStatus | 'open'; memberId: string; by: string }

/** Mark done/skipped/undo; shows the result at once everywhere the occurrence is listed. */
export function useSetStatus(hid: string) {
   const queryClient = useQueryClient()
   const refresh = useRefreshCalendar(hid)
   return useMutation({
      mutationFn: async ({ ref, status, memberId }: StatusChange) => {
         await api.post(`${occurrenceUrl(hid, ref)}/status`, { status, memberId })
      },
      onMutate: async (change) => {
         const ranges = { queryKey: calendarKey(hid) }
         const agenda = { queryKey: choresKey(hid) }
         await Promise.all([queryClient.cancelQueries(ranges), queryClient.cancelQueries(agenda)])
         const snapshot = [...queryClient.getQueriesData(ranges), ...queryClient.getQueriesData(agenda)]
         const id = `${change.ref.itemId}_${change.ref.originalStart}`
         const patch = (i: CalendarInstance) => (i.id === id && i.chore ? { ...i, chore: applyStatus(i, change) } : i)
         queryClient.setQueriesData<CalendarInstance[]>(ranges, (list) => list?.map(patch))
         queryClient.setQueriesData<ChoreAgenda>(agenda, (a) =>
            a && { ...a, overdue: a.overdue.map(patch), today: a.today.map(patch), upcoming: a.upcoming.map(patch) },
         )
         return { snapshot }
      },
      onError: (_e, _v, context) => {
         for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data)
      },
      onSettled: refresh,
   })
}

function applyStatus(instance: CalendarInstance, change: StatusChange): ChoreInfo {
   const chore = instance.chore as ChoreInfo
   const completions = chore.completions.filter((c) => c.memberId !== change.memberId)
   if (change.status !== 'open') {
      completions.push({ memberId: change.memberId, status: change.status, at: new Date().toISOString(), by: change.by, note: '' })
   }
   const state = choreState(chore.assignmentMode, instance.memberIds, completions)
   const settled = state === 'done' || state === 'skipped'
   return { ...chore, completions, state, overdue: settled ? false : chore.overdue }
}

export function useSaveItem(hid: string, id: string | null) {
   const queryClient = useQueryClient()
   const refresh = useRefreshCalendar(hid)
   return useMutation({
      mutationFn: async (input: ItemInput) =>
         id
            ? (await api.put<CalendarItem>(`${itemsUrl(hid)}/${id}`, input)).data
            : (await api.post<CalendarItem>(itemsUrl(hid), input)).data,
      onSuccess: async (item) => {
         queryClient.setQueryData(calendarItemKey(hid, item.id), item)
         await refresh()
      },
   })
}

export function useDeleteItem(hid: string) {
   const queryClient = useQueryClient()
   const refresh = useRefreshCalendar(hid)
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${itemsUrl(hid)}/${id}`)
      },
      onSuccess: async (_data, id) => {
         queryClient.removeQueries({ queryKey: calendarItemKey(hid, id) })
         await refresh()
      },
   })
}

export function useChangeOccurrence(hid: string) {
   const queryClient = useQueryClient()
   const refresh = useRefreshCalendar(hid)
   return useMutation({
      mutationFn: async ({ ref, scope, change }: { ref: OccurrenceRef; scope: Scope; change: OccurrenceChange }) => {
         await api.patch(occurrenceUrl(hid, ref), change, { params: { scope } })
      },
      onSuccess: async (_data, { ref }) => {
         await queryClient.invalidateQueries({ queryKey: calendarItemKey(hid, ref.itemId) })
         await refresh()
      },
   })
}

export function useDeleteOccurrence(hid: string) {
   const queryClient = useQueryClient()
   const refresh = useRefreshCalendar(hid)
   return useMutation({
      mutationFn: async ({ ref, scope }: { ref: OccurrenceRef; scope: Exclude<Scope, 'all'> }) => {
         await api.delete(occurrenceUrl(hid, ref), { params: { scope } })
      },
      onSuccess: async (_data, { ref }) => {
         await queryClient.invalidateQueries({ queryKey: calendarItemKey(hid, ref.itemId) })
         await refresh()
      },
   })
}
