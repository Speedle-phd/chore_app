import axios, { isAxiosError } from 'axios'
import { queryClient } from '@/lib/queryClient'

export const api = axios.create({
   baseURL: '/api',
   timeout: 10_000,
   withCredentials: true,
   headers: {
      'Content-Type': 'application/json',
      // Required by the server's CSRF check on every mutation.
      'X-Requested-With': 'fetch',
   },
})

/** Query key of the signed-in user (null = signed out). */
export const ME_KEY = ['me'] as const

// A 401 from any call means the session is gone: mark the user as signed out,
// and RequireAuth sends them to the login page.
api.interceptors.response.use(undefined, (error: unknown) => {
   if (isAxiosError(error) && error.response?.status === 401) {
      queryClient.setQueryData(ME_KEY, null)
   }
   return Promise.reject(error)
})

export type ApiError = { message: string; code?: string; details?: string[] }

/** The server's error message, code and details (falls back to a generic message). */
export function apiError(error: unknown): ApiError {
   if (isAxiosError<Partial<ApiError>>(error)) {
      const data = error.response?.data
      if (data?.message) {
         return {
            message: data.message,
            ...(data.code ? { code: data.code } : {}),
            ...(data.details ? { details: data.details } : {}),
         }
      }
      if (!error.response) {
         return { message: 'Can’t reach the server. Check your connection.' }
      }
   }
   return { message: 'Something went wrong. Please try again.' }
}
