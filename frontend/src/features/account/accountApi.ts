import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ME_KEY } from '@/api/client'
import type { User } from '@/features/auth/authApi'

export type DeviceSession = {
   id: string
   current: boolean
   userAgent: string | null
   createdAt: string
   lastSeenAt: string
}

export type DeletionCheck = Record<'blockedBy' | 'willDelete' | 'willLeave', { id: string; name: string }[]>

const SESSIONS_KEY = ['account', 'sessions'] as const

/** Saving the user also refreshes member lists, which show names and pictures. */
function useUserSaved() {
   const queryClient = useQueryClient()
   return (user: User) => {
      queryClient.setQueryData(ME_KEY, user)
      void queryClient.invalidateQueries({ queryKey: ['household'] })
   }
}

export function useUpdateAccount() {
   const saved = useUserSaved()
   return useMutation({
      mutationFn: async (input: {
         fname?: string
         lname?: string
         handle?: string | null
         findableByHandle?: boolean
      }) => (await api.patch<User>('/account', input)).data,
      onSuccess: saved,
   })
}

export function useSetAvatar() {
   const saved = useUserSaved()
   return useMutation({
      mutationFn: async (file: File) => {
         const form = new FormData()
         form.append('avatar', file)
         return (await api.put<User>('/account/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
      },
      onSuccess: saved,
   })
}

export function useRemoveAvatar() {
   const saved = useUserSaved()
   return useMutation({
      mutationFn: async () => (await api.delete<User>('/account/avatar')).data,
      onSuccess: saved,
   })
}

export function useChangePassword() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (input: { currentPassword: string; newPassword: string }) =>
         (await api.post<User>('/auth/password/change', input)).data,
      // Other devices were signed out by the server.
      onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
   })
}

export function useSessions() {
   return useQuery({
      queryKey: SESSIONS_KEY,
      queryFn: async () => (await api.get<DeviceSession[]>('/auth/sessions')).data,
   })
}

export function useRevokeSession() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`/auth/sessions/${id}`)
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
   })
}

export function useRevokeOtherSessions() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async () => (await api.delete<{ signedOut: number }>('/auth/sessions')).data,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
   })
}

export function useDeletionCheck(enabled: boolean) {
   return useQuery({
      queryKey: ['account', 'deletion-check'],
      queryFn: async () => (await api.get<DeletionCheck>('/account/deletion-check')).data,
      enabled,
      staleTime: 0,
   })
}

export function useDeleteAccount() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (password: string) => {
         await api.post('/account/delete', { password })
      },
      onSuccess: () => {
         queryClient.clear()
         queryClient.setQueryData(ME_KEY, null)
      },
   })
}
