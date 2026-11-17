import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ME_KEY } from '@/api/client'
import { useMe, type User } from '@/features/auth/authApi'
import type { StateCode } from '@/features/holidays/holidaysApi'

export type Role = 'owner' | 'admin' | 'member'

export type Household = {
   id: string
   name: string
   role: Role
   memberCount: number
   /** Playful parts of the chore stats (owners/admins switch them). */
   motivation: { leaderboard: boolean; badges: boolean; streaks: boolean; rewards: boolean }
   /** Bundesland for public holidays; null = none shown. */
   region: { state: StateCode | null }
   createdAt: string
}

export type Member = {
   id: string
   kind: 'account' | 'profile'
   role: Role
   fname: string
   lname: string
   fullName: string
   email: string | null
   avatarUrl: string | null
   /** `YYYY-MM-DD`, `--MM-DD` (year unknown) or null. */
   birthday: string | null
   isMe: boolean
   joinedAt: string
}

export const HOUSEHOLDS_KEY = ['households'] as const
export const membersKey = (hid: string) => ['household', hid, 'members'] as const

export function useHouseholds() {
   return useQuery({
      queryKey: HOUSEHOLDS_KEY,
      queryFn: async () => (await api.get<Household[]>('/households')).data,
   })
}

/** The household the app shows: the last one selected, else the first. */
export function useCurrentHousehold() {
   const me = useMe()
   const households = useHouseholds()
   const list = households.data ?? []
   const household =
      list.find((h) => h.id === me.data?.lastHouseholdId) ?? list[0] ?? null
   return { household, households: list, query: households }
}

/** Use inside RequireHousehold, where a household always exists. */
export function useHousehold(): Household {
   const { household } = useCurrentHousehold()
   if (!household) throw new Error('useHousehold must be used inside RequireHousehold')
   return household
}

function useSetLastHousehold() {
   const queryClient = useQueryClient()
   return (id: string | null) =>
      queryClient.setQueryData<User | null>(ME_KEY, (me) => (me ? { ...me, lastHouseholdId: id } : me))
}

export function useSetMotivation(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (input: Partial<Household['motivation']>) =>
         (await api.patch<Household>(`/households/${hid}/motivation`, input)).data,
      onSuccess: (household) => {
         queryClient.setQueryData<Household[]>(HOUSEHOLDS_KEY, (list) => list?.map((h) => (h.id === household.id ? household : h)))
         void queryClient.invalidateQueries({ queryKey: ['household', hid, 'stats'] })
         void queryClient.invalidateQueries({ queryKey: ['household', hid, 'rewards'] })
      },
   })
}

export function useSetRegion(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (state: StateCode | null) => (await api.patch<Household>(`/households/${hid}/region`, { state })).data,
      onSuccess: (household) => {
         queryClient.setQueryData<Household[]>(HOUSEHOLDS_KEY, (list) => list?.map((h) => (h.id === household.id ? household : h)))
      },
   })
}

export function useCreateHousehold() {
   const queryClient = useQueryClient()
   const setLast = useSetLastHousehold()
   return useMutation({
      mutationFn: async (name: string) => (await api.post<Household>('/households', { name })).data,
      onSuccess: (household) => {
         queryClient.setQueryData<Household[]>(HOUSEHOLDS_KEY, (list) => [...(list ?? []), household])
         setLast(household.id)
      },
   })
}

export function useSelectHousehold() {
   const setLast = useSetLastHousehold()
   return useMutation({
      mutationFn: async (id: string) => {
         await api.post(`/households/${id}/select`)
      },
      // Switch immediately; the server only remembers it for the next login.
      onMutate: (id) => setLast(id),
   })
}

export function useRenameHousehold(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (name: string) => (await api.patch<Household>(`/households/${hid}`, { name })).data,
      onSuccess: (updated) =>
         queryClient.setQueryData<Household[]>(HOUSEHOLDS_KEY, (list) =>
            list?.map((h) => (h.id === updated.id ? updated : h)),
         ),
   })
}

/** Leaving or deleting: drop the household locally and fall back to another one. */
function useForgetHousehold(hid: string) {
   const queryClient = useQueryClient()
   const setLast = useSetLastHousehold()
   return () => {
      queryClient.setQueryData<Household[]>(HOUSEHOLDS_KEY, (list) => list?.filter((h) => h.id !== hid))
      queryClient.removeQueries({ queryKey: ['household', hid] })
      setLast(null)
   }
}

export function useLeaveHousehold(hid: string) {
   const forget = useForgetHousehold(hid)
   return useMutation({
      mutationFn: async () => {
         await api.post(`/households/${hid}/leave`)
      },
      onSuccess: forget,
   })
}

export function useDeleteHousehold(hid: string) {
   const forget = useForgetHousehold(hid)
   return useMutation({
      mutationFn: async () => {
         await api.delete(`/households/${hid}`)
      },
      onSuccess: forget,
   })
}

export function useMembers(hid: string) {
   return useQuery({
      queryKey: membersKey(hid),
      queryFn: async () => (await api.get<Member[]>(`/households/${hid}/members`)).data,
   })
}

/** After any change to people, refetch the list (and counts in the switcher). */
function useMembersChanged(hid: string) {
   const queryClient = useQueryClient()
   return () => {
      void queryClient.invalidateQueries({ queryKey: membersKey(hid) })
      void queryClient.invalidateQueries({ queryKey: HOUSEHOLDS_KEY })
   }
}

export type ProfileInput = { fname: string; lname: string; birthday: string; avatar?: File | undefined }

export function useSaveProfile(hid: string, profileId?: string) {
   const changed = useMembersChanged(hid)
   return useMutation({
      mutationFn: async ({ fname, lname, birthday, avatar }: ProfileInput) => {
         const form = new FormData()
         form.append('fname', fname)
         form.append('lname', lname)
         form.append('birthday', birthday)
         if (avatar) form.append('avatar', avatar)
         const config = { headers: { 'Content-Type': 'multipart/form-data' } }
         return profileId
            ? (await api.put<Member>(`/households/${hid}/profiles/${profileId}`, form, config)).data
            : (await api.post<Member>(`/households/${hid}/profiles`, form, config)).data
      },
      onSuccess: changed,
   })
}

export function useChangeRole(hid: string) {
   const changed = useMembersChanged(hid)
   return useMutation({
      mutationFn: async ({ memberId, role }: { memberId: string; role: Role }) => {
         await api.patch(`/households/${hid}/members/${memberId}`, { role })
      },
      onSuccess: changed,
   })
}

export function useRemoveMember(hid: string) {
   const changed = useMembersChanged(hid)
   return useMutation({
      mutationFn: async (memberId: string) => {
         await api.delete(`/households/${hid}/members/${memberId}`)
      },
      onSuccess: changed,
   })
}
