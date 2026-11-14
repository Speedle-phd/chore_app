import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
   startAuthentication,
   startRegistration,
   WebAuthnError,
   type PublicKeyCredentialCreationOptionsJSON,
   type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { api, ME_KEY } from '@/api/client'
import type { User } from './authApi'

export type Passkey = {
   id: string
   name: string
   deviceType: 'singleDevice' | 'multiDevice'
   backedUp: boolean
   createdAt: string
   lastUsedAt: string | null
}

const PASSKEYS_KEY = ['account', 'passkeys'] as const

/** True when the user just closed or dismissed the browser's passkey prompt. */
export function isCancelled(error: unknown) {
   const name = error instanceof WebAuthnError ? (error.cause as Error | undefined)?.name : (error as Error | undefined)?.name
   return name === 'NotAllowedError' || name === 'AbortError' || (error instanceof WebAuthnError && error.code === 'ERROR_CEREMONY_ABORTED')
}

/** Friendly text for errors thrown by the browser's WebAuthn API (server errors go through apiError). */
export function passkeyErrorMessage(error: unknown): string | null {
   if (!(error instanceof WebAuthnError) && !(error instanceof DOMException)) return null
   if (isCancelled(error)) return 'The passkey prompt was closed. Nothing was changed.'
   if (error instanceof WebAuthnError && error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
      return 'This device already has a passkey for your account.'
   }
   return 'Your browser couldn’t complete the passkey request. Try again or use another device.'
}

export function usePasskeys() {
   return useQuery({
      queryKey: PASSKEYS_KEY,
      queryFn: async () => (await api.get<Passkey[]>('/auth/passkeys')).data,
   })
}

export function useAddPasskey() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (name: string) => {
         const { data } = await api.post<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>(
            '/auth/passkeys/register/options',
         )
         const response = await startRegistration({ optionsJSON: data.options })
         return (await api.post<Passkey>('/auth/passkeys/register', { challengeId: data.challengeId, response, name })).data
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY }),
   })
}

export function useRenamePasskey() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async ({ id, name }: { id: string; name: string }) =>
         (await api.patch<Passkey>(`/auth/passkeys/${id}`, { name })).data,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY }),
   })
}

export function useRemovePasskey() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`/auth/passkeys/${id}`)
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY }),
   })
}

/**
 * Signs in with a passkey. With `autofill`, the browser offers saved passkeys
 * in the email field's suggestions and this resolves once one is picked.
 */
export async function signInWithPasskey(autofill = false): Promise<User> {
   const { data } = await api.post<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>(
      '/auth/passkeys/login/options',
   )
   const response = await startAuthentication({ optionsJSON: data.options, useBrowserAutofill: autofill })
   return (await api.post<User>('/auth/passkeys/login', { challengeId: data.challengeId, response })).data
}

export function usePasskeyLogin() {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: () => signInWithPasskey(false),
      onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
   })
}
