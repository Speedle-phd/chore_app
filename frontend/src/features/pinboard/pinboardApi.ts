import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { applyLocalVote } from './pollState'

/** Server: backend/src/pinboard/pinboardViews.ts, domain/pinboard.ts */
/** count null and voterIds empty while results are hidden for you ("results after voting"). */
export type PollOption = { id: string; text: string; count: number | null; voterIds: string[] }
export type Poll = {
   multiple: boolean
   resultsAfterVote: boolean
   /** False until you voted (or it ended) when results show after voting. */
   resultsVisible: boolean
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
   | { kind: 'poll'; text: string; options: string[]; multiple: boolean; resultsAfterVote: boolean; expiry: ExpiryPreset; closes: ExpiryPreset }

const base = (hid: string) => `/households/${hid}/posts`
export const postsKey = (hid: string) => ['household', hid, 'posts'] as const

export type PostsUnread = { count: number; readAt: string }
// Under the posts prefix, so the live 'pinboard' notice refreshes it too.
const unreadKey = (hid: string) => [...postsKey(hid), 'unread'] as const

/** New notes and polls by others since the last look (server-side, follows you across devices). */
export function usePostsUnread(hid: string) {
   return useQuery({ queryKey: unreadKey(hid), queryFn: async () => (await api.get<PostsUnread>(`${base(hid)}/unread`)).data })
}

export function useMarkPostsRead(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (upTo: string) => (await api.post<PostsUnread>(`${base(hid)}/read`, { upTo })).data,
      onSuccess: (unread) => queryClient.setQueryData(unreadKey(hid), unread),
   })
}

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

/**
 * Vote as yourself or for a profile; empty options withdraw the vote. Optimistic: the bars move
 * at once, the server's answer replaces them, a failure puts the old state back.
 */
export function useVote(hid: string) {
   const queryClient = useQueryClient()
   const setPost = (id: string, change: (p: Post) => Post) =>
      queryClient.setQueryData<Post[]>(postsKey(hid), (list) => list?.map((p) => (p.id === id ? change(p) : p)))
   return useMutation({
      mutationFn: async ({ id, memberId, optionIds }: { id: string; memberId: string; optionIds: string[] }) =>
         (await api.put<Post>(`${base(hid)}/${id}/vote`, { memberId, optionIds })).data,
      onMutate: async ({ id, memberId, optionIds }) => {
         await queryClient.cancelQueries({ queryKey: postsKey(hid) })
         const before = queryClient.getQueryData<Post[]>(postsKey(hid))
         setPost(id, (p) => (p.poll ? { ...p, poll: applyLocalVote(p.poll, memberId, optionIds) } : p))
         return { before }
      },
      // Only this post changed: no refetch of the whole board.
      onSuccess: (post) => setPost(post.id, () => post),
      onError: (_e, _v, context) => {
         if (context?.before) queryClient.setQueryData(postsKey(hid), context.before)
         void queryClient.invalidateQueries({ queryKey: postsKey(hid) })
      },
   })
}
