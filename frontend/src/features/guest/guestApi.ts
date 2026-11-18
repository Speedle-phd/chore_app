import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from '@/api/client'

import type { GuestContent, GuestInfo, GuestLink, GuestPage, LinkInput, NewGuestLink } from './types'

export * from './types'

export const guestKey = (hid: string) => ['household', hid, 'guest'] as const
const linksKey = (hid: string) => ['household', hid, 'guest', 'links'] as const

export function useGuestInfo(hid: string) {
   return useQuery({
      queryKey: guestKey(hid),
      queryFn: async () => (await api.get<GuestInfo>(`/households/${hid}/guest`)).data,
   })
}

export function useSaveGuestInfo(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (content: GuestContent) => (await api.put<GuestInfo>(`/households/${hid}/guest`, content)).data,
      onSuccess: (info) => queryClient.setQueryData(guestKey(hid), info),
   })
}

/** Managers only (others get 403, so don't ask). */
export function useGuestLinks(hid: string, enabled: boolean) {
   return useQuery({
      queryKey: linksKey(hid),
      queryFn: async () => (await api.get<GuestLink[]>(`/households/${hid}/guest/links`)).data,
      enabled,
   })
}

function useLinkMutation<V, R>(hid: string, fn: (v: V) => Promise<R>) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: fn,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: linksKey(hid) }),
   })
}

export const useCreateLink = (hid: string) =>
   useLinkMutation(hid, async (input: LinkInput) => (await api.post<NewGuestLink>(`/households/${hid}/guest/links`, input)).data)

export const useUpdateLink = (hid: string) =>
   useLinkMutation(hid, async ({ id, ...patch }: Partial<LinkInput> & { id: string }) => (await api.patch<GuestLink>(`/households/${hid}/guest/links/${id}`, patch)).data)

export const useReplaceLink = (hid: string) =>
   useLinkMutation(hid, async (id: string) => (await api.post<NewGuestLink>(`/households/${hid}/guest/links/${id}/replace`)).data)

export const useRemoveLink = (hid: string) =>
   useLinkMutation(hid, async (id: string) => {
      await api.delete(`/households/${hid}/guest/links/${id}`)
      return null
   })

/** The public page behind a link (no session needed). */
export function useGuestPage(token: string) {
   return useQuery({
      queryKey: ['guest-page', token],
      queryFn: async () => (await api.get<GuestPage>(`/guest/${encodeURIComponent(token)}`)).data,
      // 404/410 won't change by asking again.
      retry: (count, error) => count < 2 && !(isAxiosError(error) && [404, 410, 429].includes(error.response?.status ?? 0)),
      refetchOnWindowFocus: false,
   })
}

/** Which state a failed guest page load is in. */
export function guestPageProblem(error: unknown): 'expired' | 'missing' | 'other' {
   const status = isAxiosError(error) ? error.response?.status : undefined
   return status === 410 ? 'expired' : status === 404 ? 'missing' : 'other'
}
