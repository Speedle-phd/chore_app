import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { viewerTimeZone } from '@/features/calendar/time'

/** Server: backend/src/calendar/statsService.ts */
export type Motivation = { leaderboard: boolean; badges: boolean; streaks: boolean }
export type MemberStats = {
   memberId: string
   points: number
   done: number
   onTime: number
   skipped: number
   assigned: number
   missed: number
   /** Share of all points in the period (null: no points yet). */
   share: number | null
   streak: { current: number; best: number } | null
   badges: { id: string; earnedAt: string }[] | null
}
export type Stats = {
   from: string
   to: string
   today: string
   bucket: 'day' | 'week'
   motivation: Motivation
   fairShare: number | null
   totals: { done: number; onTime: number; points: number; skipped: number; missed: number; onTimeRate: number | null }
   members: MemberStats[]
   chores: { itemId: string; title: string; done: number; skipped: number; missed: number; topMemberId: string | null }[]
   series: { date: string; points: number; done: number }[]
   badgeCatalog: { id: string; name: string; description: string; icon: string }[]
}

export const statsKey = (hid: string, from: string, to: string) => ['household', hid, 'stats', from, to] as const

export function useStats(hid: string, range: { from: string; to: string }) {
   return useQuery({
      queryKey: statsKey(hid, range.from, range.to),
      queryFn: async () => (await api.get<Stats>(`/households/${hid}/stats`, { params: { ...range, tz: viewerTimeZone() } })).data,
      // Keep the previous period on screen (dimmed) while the next loads.
      placeholderData: keepPreviousData,
   })
}
