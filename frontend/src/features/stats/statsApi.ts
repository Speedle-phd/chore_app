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
   /** Towards each badge (all time; streak badges: the current streak). Null when badges are off. */
   progress: BadgeProgress[] | null
}
export type BadgeProgress = { id: string; value: number; goal: number }
/** Mirrors backend/src/domain/badges.ts (BADGE_ANIMALS, BADGE_ACCESSORIES). */
export type BadgeAnimalId = 'panda' | 'koala' | 'seal' | 'icebear' | 'racoon' | 'dog' | 'owl' | 'cat'
export type BadgeAccessory = 'none' | 'sparkles' | 'medal' | 'crown' | 'glasses' | 'headband' | 'heart' | 'hearts' | 'sun' | 'flame' | 'moon' | 'shades' | 'star'
export type BadgeDef = { id: string; name: string; description: string; animal: BadgeAnimalId; accessory: BadgeAccessory; goal: number }
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
   badgeCatalog: BadgeDef[]
}

/** One member's overview (server: statsService.member). */
export type MemberOverview = {
   from: string
   to: string
   today: string
   bucket: 'day' | 'week'
   motivation: Motivation
   member: MemberStats
   /** Place on the leaderboard (null: leaderboard off or no points yet), out of `ranked` people with points. */
   rank: number | null
   ranked: number
   series: { date: string; points: number; done: number }[]
   recent: { itemId: string; title: string; date: string; status: 'done' | 'skipped'; at: string }[]
   badgeCatalog: BadgeDef[]
}

export const statsKey = (hid: string, from: string, to: string) => ['household', hid, 'stats', from, to] as const

export function useMemberStats(hid: string, memberId: string, range: { from: string; to: string }, enabled = true) {
   return useQuery({
      enabled,
      // Under the stats prefix, so the live 'calendar' notice refreshes it too.
      queryKey: ['household', hid, 'stats', 'member', memberId, range.from, range.to] as const,
      queryFn: async () =>
         (await api.get<MemberOverview>(`/households/${hid}/stats/members/${memberId}`, { params: { ...range, tz: viewerTimeZone() } })).data,
      // Keep the previous period while the next loads, but never another person's numbers.
      placeholderData: (previous) => (previous?.member.memberId === memberId ? previous : undefined),
   })
}

export function useStats(hid: string, range: { from: string; to: string }) {
   return useQuery({
      queryKey: statsKey(hid, range.from, range.to),
      queryFn: async () => (await api.get<Stats>(`/households/${hid}/stats`, { params: { ...range, tz: viewerTimeZone() } })).data,
      // Keep the previous period on screen (dimmed) while the next loads.
      placeholderData: keepPreviousData,
   })
}
