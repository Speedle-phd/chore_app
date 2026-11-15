import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { CalendarKind } from '@/features/calendar/calendarApi'
import { viewerTimeZone } from '@/features/calendar/time'

export type ReminderTarget =
   | { type: 'item'; itemId: string }
   | { type: 'member'; memberId: string }
   | { type: 'allBirthdays' }

/** Server: backend/src/reminders/reminderService.ts */
export type Reminder = { id: string; target: ReminderTarget; label: string; leadDays: number[]; channels: string[] }
export type UpcomingReminder = {
   sendOn: string
   leadDays: number
   date: string
   kind: CalendarKind
   title: string
   allDay: boolean
   start: string
   age: number | null
}

/** Offered lead times (days before); mirrors LEAD_DAYS on the server. */
export const LEAD_OPTIONS = [
   { days: 0, label: 'On the day' },
   { days: 1, label: 'The day before' },
   { days: 7, label: 'A week before' },
] as const

export const leadText = (days: number[]) =>
   days
      .map((d) => LEAD_OPTIONS.find((o) => o.days === d)?.label.toLowerCase() ?? `${d} days before`)
      .join(', ')

export const sameTarget = (a: ReminderTarget, b: ReminderTarget) =>
   a.type === b.type &&
   (a.type !== 'item' || (b.type === 'item' && a.itemId === b.itemId)) &&
   (a.type !== 'member' || (b.type === 'member' && a.memberId === b.memberId))

export const remindersKey = (hid: string) => ['household', hid, 'reminders'] as const

export function useReminders(hid: string) {
   return useQuery({
      queryKey: remindersKey(hid),
      queryFn: async () => (await api.get<Reminder[]>(`/households/${hid}/reminders`)).data,
   })
}

export function useUpcomingReminders(hid: string, days = 30) {
   return useQuery({
      queryKey: [...remindersKey(hid), 'upcoming', days] as const,
      queryFn: async () =>
         (await api.get<UpcomingReminder[]>(`/households/${hid}/reminders/upcoming`, { params: { tz: viewerTimeZone(), days } })).data,
   })
}

export function useSaveReminder(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (input: { target: ReminderTarget; leadDays: number[] }) =>
         (await api.put<Reminder>(`/households/${hid}/reminders`, input)).data,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: remindersKey(hid) }),
   })
}

export function useDeleteReminder(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`/households/${hid}/reminders/${id}`)
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: remindersKey(hid) }),
   })
}
