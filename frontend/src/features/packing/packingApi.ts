import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from '@/api/client'
import type { PackingSection } from './sections'

/** Server: backend/src/packing/packingViews.ts */
/** amount null = none; perDay: amount × trip days, capped by maxAmount. */
export type TemplateItem = { text: string; section: PackingSection; perPerson: boolean; amount: number | null; perDay: boolean; maxAmount: number | null }
export type PackingTemplate = { id: string; name: string; items: TemplateItem[]; createdBy: string; createdAt: string }
export type Progress = { done: number; total: number }
export type PackingListSummary = {
   id: string
   name: string
   vacationId: string | null
   travellerIds: string[]
   /** Trip length used for per-day amounts; null = unknown. */
   days: number | null
   progress: Progress
   createdBy: string
   archivedAt: string | null
   createdAt: string
}
export type PackingItem = {
   id: string
   text: string
   section: PackingSection
   /** Whose it is; null = shared. */
   memberId: string | null
   /** How many to pack; null = no amount. */
   quantity: number | null
   checked: boolean
   checkedBy: string | null
   checkedAt: string | null
}
export type PackingList = PackingListSummary & { items: PackingItem[] }
export type ListInput = { name: string; templateId: string | null; vacationId: string | null; travellerIds: string[]; days: number | null }
export type ItemInput = { text: string; section: PackingSection; memberId: string | null; quantity: number | null }
export type ItemUpdate = Partial<Pick<PackingItem, 'text' | 'section' | 'memberId' | 'quantity' | 'checked'>>

const base = (hid: string) => `/households/${hid}/packing`
// One prefix, so the live 'packing' notice refreshes all of it.
const packingKey = (hid: string) => ['household', hid, 'packing'] as const
const templatesKey = (hid: string) => [...packingKey(hid), 'templates'] as const
const listsKey = (hid: string) => [...packingKey(hid), 'lists'] as const
const listKey = (hid: string, id: string) => [...packingKey(hid), 'list', id] as const

export function useTemplates(hid: string) {
   return useQuery({ queryKey: templatesKey(hid), queryFn: async () => (await api.get<PackingTemplate[]>(`${base(hid)}/templates`)).data })
}

export function usePackingLists(hid: string) {
   return useQuery({ queryKey: listsKey(hid), queryFn: async () => (await api.get<PackingListSummary[]>(`${base(hid)}/lists`)).data })
}

export const isNotFound = (error: unknown) => isAxiosError(error) && error.response?.status === 404

export function usePackingList(hid: string, id: string) {
   return useQuery({
      queryKey: listKey(hid, id),
      queryFn: async () => (await api.get<PackingList>(`${base(hid)}/lists/${id}`)).data,
      // A deleted list stays deleted: show "not found" at once.
      retry: (count, error) => !isNotFound(error) && count < 3,
   })
}

/** After a change: the answer for the open list, then refresh overviews (counts, names). */
function useSettle(hid: string) {
   const queryClient = useQueryClient()
   return (list?: PackingList) => {
      if (list) queryClient.setQueryData(listKey(hid, list.id), list)
      void queryClient.invalidateQueries({ queryKey: listsKey(hid) })
   }
}

export function useSaveTemplate(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async ({ id, input }: { id: string | null; input: { name: string; items: TemplateItem[] } }) =>
         id
            ? (await api.patch<PackingTemplate>(`${base(hid)}/templates/${id}`, input)).data
            : (await api.post<PackingTemplate>(`${base(hid)}/templates`, input)).data,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey(hid) }),
   })
}

export function useDeleteTemplate(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${base(hid)}/templates/${id}`)
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey(hid) }),
   })
}

export function useCreateList(hid: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async (input: ListInput) => (await api.post<PackingList>(`${base(hid)}/lists`, input)).data,
      onSuccess: (list) => settle(list),
   })
}

export function useUpdateList(hid: string, id: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async (change: { name?: string; archived?: boolean; travellerIds?: string[]; copyItems?: boolean }) =>
         (await api.patch<PackingList>(`${base(hid)}/lists/${id}`, change)).data,
      onSuccess: (list) => settle(list),
   })
}

export function useDeleteList(hid: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${base(hid)}/lists/${id}`)
      },
      onSuccess: (_v, id) => {
         queryClient.removeQueries({ queryKey: listKey(hid, id) })
         void queryClient.invalidateQueries({ queryKey: listsKey(hid) })
      },
   })
}

export function useAddPackingItem(hid: string, listId: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async (input: ItemInput) => (await api.post<PackingList>(`${base(hid)}/lists/${listId}/items`, input)).data,
      onSuccess: (list) => settle(list),
   })
}

/** Ticking shows at once; the server's answer (or a failure) settles it. */
export function useUpdatePackingItem(hid: string, listId: string) {
   const queryClient = useQueryClient()
   const settle = useSettle(hid)
   const key = listKey(hid, listId)
   return useMutation({
      mutationFn: async ({ id, change }: { id: string; change: ItemUpdate }) =>
         (await api.patch<PackingList>(`${base(hid)}/lists/${listId}/items/${id}`, change)).data,
      onMutate: async ({ id, change }) => {
         await queryClient.cancelQueries({ queryKey: key })
         const previous = queryClient.getQueryData<PackingList>(key)
         queryClient.setQueryData<PackingList>(key, (list) => list && { ...list, items: list.items.map((i) => (i.id === id ? { ...i, ...change } : i)) })
         return { previous }
      },
      onError: (_e, _v, context) => queryClient.setQueryData(key, context?.previous),
      onSuccess: (list) => settle(list),
   })
}

export function useRemovePackingItem(hid: string, listId: string) {
   const settle = useSettle(hid)
   return useMutation({
      mutationFn: async (id: string) => (await api.delete<PackingList>(`${base(hid)}/lists/${listId}/items/${id}`)).data,
      onSuccess: (list) => settle(list),
   })
}

export function useToShopping(hid: string, listId: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (shoppingListId: string) => (await api.post<{ added: number }>(`${base(hid)}/lists/${listId}/to-shopping`, { shoppingListId })).data,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['household', hid, 'shopping'] }),
   })
}

export function useSaveAsTemplate(hid: string, listId: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (name: string) => (await api.post<PackingTemplate>(`${base(hid)}/lists/${listId}/save-as-template`, { name })).data,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey(hid) }),
   })
}
