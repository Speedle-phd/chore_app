import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'

/** Server: backend/src/pinboard/pinboardViews.ts, domain/pinboard.ts */
export type PollOption = { id: string; text: string; count: number; voterIds: string[] }
export type Poll = {
   multiple: boolean
   closesAt: string | null
   closedAt: string | null
   open: boolean
   voters: number
   options: PollOption[]
}
export type Post = {
   id: string
   kind: 'note' | 'poll'
   text: string
   authorId: string
   pinned: boolean
   expiresAt: string | null
   editedAt: string | null
   createdAt: string
   poll: Poll | null
}
export type ExpiryPreset = 'day' | '3days' | 'week' | 'month' | 'never'
export type PostInput =
   | { kind: 'note'; text: string; expiry: ExpiryPreset }
   | { kind: 'poll'; text: string; options: string[]; multiple: boolean; expiry: ExpiryPreset; closes: ExpiryPreset }

const base = (hid: string) => `/households/${hid}/posts`
export const postsKey = (hid: string) => ['household', hid, 'posts'] as const

export function usePosts(hid: string) {
   return useQuery({ queryKey: postsKey(hid), queryFn: async () => (await api.get<Post[]>(base(hid))).data })
}

/** Put the server's answer for one post into the list (order may change: refetch). */
function useSettle(hid: string) {
   const queryClient = useQueryClient()
   return (post?: Post) => {
      if (post) queryClient.setQueryData<Post[]>(postsKey(hid), (list) => list?.map((p) => (p.id === post.id ? post : p)))
      void queryClient.invalidateQueries({ queryKey: postsKey(hid) })
   }
}

export function useCreatePost(hid: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async (input: PostInput) => (await api.post<Post>(base(hid), input)).data,
      onSuccess: () => settle(),
   })
}

export function useEditPost(hid: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async ({ id, text }: { id: string; text: string }) => (await api.patch<Post>(`${base(hid)}/${id}`, { text })).data,
      onSuccess: settle,
   })
}

export function usePinPost(hid: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => (await api.post<Post>(`${base(hid)}/${id}/${pinned ? 'pin' : 'unpin'}`)).data,
      onSuccess: settle,
   })
}

export function useClosePoll(hid: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async (id: string) => (await api.post<Post>(`${base(hid)}/${id}/close`)).data,
      onSuccess: settle,
   })
}

export function useDeletePost(hid: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${base(hid)}/${id}`)
      },
      onSuccess: () => settle(),
   })
}

/** Vote as yourself or for a profile; empty options withdraw the vote. */
export function useVote(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async ({ id, memberId, optionIds }: { id: string; memberId: string; optionIds: string[] }) =>
         (await api.put<Post>(`${base(hid)}/${id}/vote`, { memberId, optionIds })).data,
      // Only this post changed: no refetch of the whole board.
      onSuccess: (post) => queryClient.setQueryData<Post[]>(postsKey(hid), (list) => list?.map((p) => (p.id === post.id ? post : p))),
      onError: () => queryClient.invalidateQueries({ queryKey: postsKey(hid) }),
   })
}
