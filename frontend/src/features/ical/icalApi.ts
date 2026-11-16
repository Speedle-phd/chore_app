import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { calendarKey, choresKey, type CalendarKind } from '@/features/calendar/calendarApi'
import { viewerTimeZone } from '@/features/calendar/time'

/** Server: backend/src/ical/icalService.ts */
export type FeedScope = 'all' | 'mine'
export type Feed = { enabled: boolean; scope: FeedScope; issuedAt: string | null; lastUsedAt: string | null }
/** Only returned when the link is made: the server keeps just a hash. */
export type NewFeed = Feed & { url: string }

export type PreviewEntry = {
   uid: string
   title: string
   allDay: boolean
   /** Local wall-clock in `timezone` (all-day: `YYYY-MM-DD`, end exclusive). */
   start: string
   end: string
   timezone: string
   repeats: boolean
   duplicate: boolean
   problem: string | null
}

const feedKey = (hid: string) => ['household', hid, 'ical-feed'] as const

export function useFeed(hid: string) {
   return useQuery({
      queryKey: feedKey(hid),
      queryFn: async () => (await api.get<Feed>(`/households/${hid}/ical/feed`)).data,
   })
}

/** Creates the link or replaces it (the old one stops working). */
export function useCreateFeed(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (scope: FeedScope) => (await api.post<NewFeed>(`/households/${hid}/ical/feed`, { scope })).data,
      onSuccess: ({ url: _url, ...feed }) => queryClient.setQueryData(feedKey(hid), feed),
   })
}

export function useSetFeedScope(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (scope: FeedScope) => (await api.patch<Feed>(`/households/${hid}/ical/feed`, { scope })).data,
      onSuccess: (feed) => queryClient.setQueryData(feedKey(hid), feed),
   })
}

export function useRemoveFeed(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async () => {
         await api.delete(`/households/${hid}/ical/feed`)
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKey(hid) }),
   })
}

const importForm = (file: File, kind: CalendarKind, uids?: string[]) => {
   const form = new FormData()
   form.append('kind', kind)
   form.append('tz', viewerTimeZone())
   if (uids) form.append('uids', JSON.stringify(uids))
   form.append('file', file)
   return form
}
const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30_000 }

/** Reads the file on the server; nothing is stored. */
export function usePreviewImport(hid: string) {
   return useMutation({
      mutationFn: async ({ file, kind }: { file: File; kind: CalendarKind }) =>
         (await api.post<{ entries: PreviewEntry[] }>(`/households/${hid}/ical/import/preview`, importForm(file, kind), multipart))
            .data.entries,
   })
}

export function useImport(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async ({ file, kind, uids }: { file: File; kind: CalendarKind; uids: string[] }) =>
         (
            await api.post<{ imported: number; skipped: number }>(
               `/households/${hid}/ical/import`,
               importForm(file, kind, uids),
               multipart,
            )
         ).data,
      onSuccess: () =>
         Promise.all([
            queryClient.invalidateQueries({ queryKey: calendarKey(hid) }),
            queryClient.invalidateQueries({ queryKey: choresKey(hid) }),
            queryClient.invalidateQueries({ queryKey: ['household', hid, 'calendar-items'] }),
         ]),
   })
}
