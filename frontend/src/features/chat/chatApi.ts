import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { api } from '@/api/client'

/** Server: backend/src/chat/chatViews.ts */
export type ChatMessage = {
   id: string
   authorId: string
   /** Empty when deleted. */
   text: string
   deleted: boolean
   editedAt: string | null
   /** Grouped by emoji, in first-used order; who reacted in reacting order. */
   reactions: { emoji: string; count: number; memberIds: string[] }[]
   createdAt: string
}
type Page = { messages: ChatMessage[]; hasMore: boolean }
export type Unread = { count: number; readAt: string }

const base = (hid: string) => `/households/${hid}/chat`
// One prefix: the live 'chat' notice refreshes messages and the unread count.
const chatKey = (hid: string) => ['household', hid, 'chat'] as const
const messagesKey = (hid: string) => [...chatKey(hid), 'messages'] as const
const unreadKey = (hid: string) => [...chatKey(hid), 'unread'] as const

/** Pages of messages, newest page first; "Load earlier" fetches the page before the oldest shown. */
export function useMessages(hid: string) {
   return useInfiniteQuery({
      queryKey: messagesKey(hid),
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) =>
         (await api.get<Page>(`${base(hid)}/messages`, { params: pageParam ? { before: pageParam } : {} })).data,
      getNextPageParam: (page) => (page.hasMore ? (page.messages[0]?.id ?? null) : null),
   })
}

/** All loaded messages, oldest first. */
export const flatten = (data: InfiniteData<Page> | undefined) => (data ? [...data.pages].reverse().flatMap((p) => p.messages) : [])

export function useUnread(hid: string) {
   return useQuery({ queryKey: unreadKey(hid), queryFn: async () => (await api.get<Unread>(`${base(hid)}/unread`)).data })
}

/** Put one message (new or changed) into the newest page. */
function useMergeMessage(hid: string) {
   const queryClient = useQueryClient()
   return (message: ChatMessage) =>
      queryClient.setQueryData<InfiniteData<Page>>(messagesKey(hid), (data) => {
         if (!data) return data
         const known = data.pages.some((p) => p.messages.some((m) => m.id === message.id))
         const pages = data.pages.map((p, i) => ({
            ...p,
            messages: known
               ? p.messages.map((m) => (m.id === message.id ? message : m))
               : i === 0
                 ? [...p.messages, message]
                 : p.messages,
         }))
         return { ...data, pages }
      })
}

export function useSendMessage(hid: string) {
   const merge = useMergeMessage(hid)
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (text: string) => (await api.post<ChatMessage>(`${base(hid)}/messages`, { text })).data,
      onSuccess: (message) => {
         merge(message)
         void queryClient.invalidateQueries({ queryKey: unreadKey(hid) })
      },
   })
}

export function useEditMessage(hid: string) {
   const merge = useMergeMessage(hid)
   return useMutation({
      mutationFn: async ({ id, text }: { id: string; text: string }) => (await api.patch<ChatMessage>(`${base(hid)}/messages/${id}`, { text })).data,
      onSuccess: merge,
   })
}

export function useDeleteMessage(hid: string) {
   const merge = useMergeMessage(hid)
   return useMutation({
      mutationFn: async (id: string) => (await api.delete<ChatMessage>(`${base(hid)}/messages/${id}`)).data,
      onSuccess: merge,
   })
}

/** My reaction with this emoji toggled locally (optimistic; mirrors domain/reactions.ts). */
export function toggleReaction(message: ChatMessage, emoji: string, memberId: string): ChatMessage {
   const group = message.reactions.find((r) => r.emoji === emoji)
   const mine = Boolean(group?.memberIds.includes(memberId))
   const reactions = mine
      ? message.reactions
           .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, memberIds: r.memberIds.filter((m) => m !== memberId) } : r))
           .filter((r) => r.count > 0)
      : group
        ? message.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, memberIds: [...r.memberIds, memberId] } : r))
        : [...message.reactions, { emoji, count: 1, memberIds: [memberId] }]
   return { ...message, reactions }
}

/** React with an emoji or take it back. Optimistic; the server's answer replaces it. */
export function useReact(hid: string, myId: string | undefined) {
   const queryClient = useQueryClient()
   const merge = useMergeMessage(hid)
   return useMutation({
      mutationFn: async ({ id, emoji }: { id: string; emoji: string }) =>
         (await api.post<ChatMessage>(`${base(hid)}/messages/${id}/reactions`, { emoji })).data,
      onMutate: async ({ id, emoji }) => {
         await queryClient.cancelQueries({ queryKey: messagesKey(hid) })
         const before = queryClient.getQueryData<InfiniteData<Page>>(messagesKey(hid))
         const message = before?.pages.flatMap((p) => p.messages).find((m) => m.id === id)
         if (message && myId) merge(toggleReaction(message, emoji, myId))
         return { before }
      },
      onSuccess: merge,
      onError: (_e, _v, context) => {
         if (context?.before) queryClient.setQueryData(messagesKey(hid), context.before)
      },
   })
}

export function useMarkRead(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (upTo: string) => (await api.post<Unread>(`${base(hid)}/read`, { upTo })).data,
      onSuccess: (unread) => queryClient.setQueryData(unreadKey(hid), unread),
   })
}
