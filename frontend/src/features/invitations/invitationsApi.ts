import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ME_KEY } from '@/api/client'
import type { User } from '@/features/auth/authApi'
import { HOUSEHOLDS_KEY, type Household } from '@/features/households/householdsApi'

export type InvitableRole = 'admin' | 'member'

/** What admins see in the pending list (never the token). */
export type Invitation = {
   id: string
   kind: 'email' | 'user' | 'link'
   role: InvitableRole
   email: string | null
   user: { fullName: string; handle: string | null } | null
   claims: { id: string; fullName: string } | null
   uses: number
   maxUses: number
   expiresAt: string
   createdAt: string
}

/** What the invited person sees. */
export type ReceivedInvitation = {
   id: string
   kind: 'email' | 'user' | 'link'
   role: InvitableRole
   household: string
   inviter: string
   claims: string | null
   emailHint: string | null
   expiresAt: string
}

export type NewInvitation =
   | { kind: 'email'; email: string; role: InvitableRole; claimsMembershipId?: string | undefined }
   | { kind: 'user'; userId: string; role: InvitableRole; claimsMembershipId?: string | undefined }
   | { kind: 'link'; role: InvitableRole; maxUses: number }

export type FoundUser = { id: string; fullName: string; handle: string }

const invitationsKey = (hid: string) => ['household', hid, 'invitations'] as const
const MINE_KEY = ['invitations', 'mine'] as const

export function useHouseholdInvitations(hid: string, enabled: boolean) {
   return useQuery({
      queryKey: invitationsKey(hid),
      queryFn: async () => (await api.get<Invitation[]>(`/households/${hid}/invitations`)).data,
      enabled,
   })
}

export function useCreateInvitation(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (input: NewInvitation) =>
         (
            await api.post<{ invitation: Invitation; emailSent?: boolean; url?: string }>(
               `/households/${hid}/invitations`,
               input,
            )
         ).data,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey(hid) }),
   })
}

export function useRevokeInvitation(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`/households/${hid}/invitations/${id}`)
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey(hid) }),
   })
}

export function useResendInvitation(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (id: string) =>
         (await api.post<{ emailSent: boolean }>(`/households/${hid}/invitations/${id}/resend`)).data,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey(hid) }),
   })
}

/** Exact @handle lookup; resolves to null when nobody (findable) has it. */
export const searchUser = async (handle: string) =>
   (await api.get<FoundUser | null>('/users/search', { params: { handle } })).data

export function useMyInvitations() {
   return useQuery({
      queryKey: MINE_KEY,
      queryFn: async () => (await api.get<ReceivedInvitation[]>('/invitations/mine')).data,
   })
}

export function useInvitationPreview(token: string | null) {
   return useQuery({
      queryKey: ['invitations', 'preview', token],
      queryFn: async () =>
         (await api.get<ReceivedInvitation>('/invitations/preview', { params: { token } })).data,
      enabled: Boolean(token),
      retry: false,
   })
}

/** Accept by emailed/shared token or by id (in-app); the joined household becomes current. */
export function useAcceptInvitation() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (by: { token: string } | { id: string }) =>
         'token' in by
            ? (await api.post<Household>('/invitations/accept', { token: by.token })).data
            : (await api.post<Household>(`/invitations/${by.id}/accept`)).data,
      onSuccess: (household) => {
         clearPendingInvite()
         queryClient.setQueryData<Household[]>(HOUSEHOLDS_KEY, (list) => [
            ...(list ?? []).filter((h) => h.id !== household.id),
            household,
         ])
         queryClient.setQueryData<User | null>(ME_KEY, (me) => (me ? { ...me, lastHouseholdId: household.id } : me))
         void queryClient.invalidateQueries({ queryKey: MINE_KEY })
      },
   })
}

export function useDeclineInvitation() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (id: string) => {
         await api.post(`/invitations/${id}/decline`)
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: MINE_KEY }),
   })
}

// A share-link token opened while signed out is kept briefly on this device,
// so the invitation can continue after signing up (which opens a new tab).
const PENDING_KEY = 'hearth:pending-invite'
const PENDING_TTL_MS = 24 * 60 * 60_000

export function savePendingInvite(token: string) {
   try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ token, until: Date.now() + PENDING_TTL_MS }))
   } catch {
      // Storage unavailable (private mode): the link simply has to be opened again.
   }
}

export function readPendingInvite(): string | null {
   try {
      const raw = localStorage.getItem(PENDING_KEY)
      if (!raw) return null
      const { token, until } = JSON.parse(raw) as { token?: string; until?: number }
      if (!token || !until || until < Date.now()) {
         localStorage.removeItem(PENDING_KEY)
         return null
      }
      return token
   } catch {
      return null
   }
}

export function clearPendingInvite() {
   try {
      localStorage.removeItem(PENDING_KEY)
   } catch {
      // ignore
   }
}
