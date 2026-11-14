import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api, ME_KEY } from '@/api/client'
import { clearPendingInvite } from '@/features/invitations/invitationsApi'

export type User = {
   id: string
   email: string
   fname: string
   lname: string
   fullName: string
   emailVerified: boolean
   lastHouseholdId: string | null
   handle: string | null
   findableByHandle: boolean
   avatarUrl: string | null
}

export type SignupInput = {
   fname: string
   lname: string
   email: string
   password: string
}

/** Mirrors the server's policy (NIST SP 800-63B-4); the server stays authoritative. */
export const PASSWORD_MIN_LENGTH = 15

async function fetchMe(): Promise<User | null> {
   try {
      return (await api.get<User>('/auth/me')).data
   } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) return null
      throw error
   }
}

/** The signed-in user; `null` when signed out. */
export function useMe() {
   return useQuery({
      queryKey: ME_KEY,
      queryFn: fetchMe,
      staleTime: 5 * 60_000,
      retry: false,
   })
}

/** Mutations that sign the user in put the returned user straight into the cache. */
function useSignInMutation<T>(request: (input: T) => Promise<User>) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: request,
      onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
   })
}

export const useLogin = () =>
   useSignInMutation(
      async (input: { email: string; password: string }) =>
         (await api.post<User>('/auth/login', input)).data,
   )

export const useVerifyEmail = () =>
   useSignInMutation(
      async (token: string) =>
         (await api.post<User>('/auth/verify-email', { token })).data,
   )

export const useResetPassword = () =>
   useSignInMutation(
      async (input: { token: string; password: string }) =>
         (await api.post<User>('/auth/password/reset', input)).data,
   )

export const useSignup = () =>
   useMutation({
      mutationFn: async (input: SignupInput) => {
         await api.post('/auth/signup', input)
      },
   })

export const useResendVerification = () =>
   useMutation({
      mutationFn: async (email: string) => {
         await api.post('/auth/verify-email/resend', { email })
      },
   })

export const useForgotPassword = () =>
   useMutation({
      mutationFn: async (email: string) => {
         await api.post('/auth/password/forgot', { email })
      },
   })

export function useLogout() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async () => {
         await api.post('/auth/logout')
      },
      // Forget everything cached for this person.
      onSettled: () => {
         queryClient.clear()
         queryClient.setQueryData(ME_KEY, null)
         clearPendingInvite()
      },
   })
}

/**
 * Only same-app paths, so `?next=` can't redirect to another site.
 * Browsers treat `//` and `/\` as protocol-relative URLs.
 */
export function safeNextPath(next: string | null): string {
   if (!next || !next.startsWith('/') || /^\/[/\\]/.test(next)) return '/'
   return next
}
