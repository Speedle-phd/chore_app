import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { UnitId } from './units'

/** Server: backend/src/shopping/shoppingViews.ts */
export type ShoppingList = { id: string; name: string; position: number; openCount: number; createdBy: string }
export type ShoppingItem = {
   id: string
   listId: string
   name: string
   quantity: number | null
   unit: UnitId | null
   note: string
   categoryId: string | null
   checked: boolean
   checkedAt: string | null
   checkedBy: string | null
   addedBy: string
   fromRecipeIds: string[]
   createdAt: string
}
export type ShoppingCategory = { id: string; key: string | null; name: string; icon: string; position: number }
export type Suggestion = { name: string; unit: UnitId | null; quantity: number | null; categoryId: string | null; source: 'history' | 'catalog' }
export type ItemInput = {
   name: string
   quantity?: number | null
   unit?: UnitId | null
   note?: string
   /** Omitted: remembered or catalog category; null: none. */
   categoryId?: string | null
   checked?: boolean
   fromRecipeIds?: string[]
}
export type ItemUpdate = Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'note' | 'categoryId' | 'checked'>>

const base = (hid: string) => `/households/${hid}/shopping`
// Everything under one prefix, so the live 'shopping' notice refreshes all of it.
export const shoppingKey = (hid: string) => ['household', hid, 'shopping'] as const
const listsKey = (hid: string) => [...shoppingKey(hid), 'lists'] as const
export const itemsKey = (hid: string, listId: string) => [...shoppingKey(hid), 'items', listId] as const
const categoriesKey = (hid: string) => [...shoppingKey(hid), 'categories'] as const

export function useShoppingLists(hid: string) {
   return useQuery({ queryKey: listsKey(hid), queryFn: async () => (await api.get<ShoppingList[]>(`${base(hid)}/lists`)).data })
}

export function useListItems(hid: string, listId: string | null) {
   return useQuery({
      queryKey: itemsKey(hid, listId ?? ''),
      queryFn: async () => (await api.get<ShoppingItem[]>(`${base(hid)}/lists/${listId}/items`)).data,
      enabled: Boolean(listId),
   })
}

export function useCategories(hid: string) {
   return useQuery({ queryKey: categoriesKey(hid), queryFn: async () => (await api.get<ShoppingCategory[]>(`${base(hid)}/categories`)).data })
}

export function useSuggestions(hid: string, query: string, enabled: boolean) {
   return useQuery({
      queryKey: [...shoppingKey(hid), 'suggestions', query] as const,
      queryFn: async () => (await api.get<Suggestion[]>(`${base(hid)}/suggestions`, { params: { q: query } })).data,
      enabled,
      staleTime: 30_000,
      placeholderData: (previous) => previous,
   })
}

/**
 * After any write: lists (open counts), items, suggestions. Not awaited, so a
 * mutation settles as soon as the server answered (the next item can be added at once).
 */
function useRefresh(hid: string) {
   const queryClient = useQueryClient()
   return () => {
      void queryClient.invalidateQueries({ queryKey: shoppingKey(hid) })
   }
}

export function useCreateList(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async (name: string) => (await api.post<ShoppingList>(`${base(hid)}/lists`, { name })).data,
      onSuccess: refresh,
   })
}

export function useRenameList(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async ({ id, name }: { id: string; name: string }) => (await api.patch<ShoppingList>(`${base(hid)}/lists/${id}`, { name })).data,
      onSuccess: refresh,
   })
}

export function useDeleteList(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${base(hid)}/lists/${id}`)
      },
      onSuccess: refresh,
   })
}

export function useAddItems(hid: string, listId: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async (items: ItemInput[]) =>
         items.length === 1
            ? [(await api.post<ShoppingItem>(`${base(hid)}/lists/${listId}/items`, items[0])).data]
            : (await api.post<ShoppingItem[]>(`${base(hid)}/lists/${listId}/items/batch`, { items })).data,
      onSuccess: refresh,
   })
}

/** Edit an item; checking/unchecking shows at once and reverts on failure. */
export function useUpdateItem(hid: string, listId: string) {
   const queryClient = useQueryClient()
   const refresh = useRefresh(hid)
   const key = itemsKey(hid, listId)
   return useMutation({
      mutationKey: itemChangeKey(hid, listId),
      mutationFn: async ({ id, change }: { id: string; change: ItemUpdate }) =>
         (await api.patch<ShoppingItem>(`${base(hid)}/lists/${listId}/items/${id}`, change)).data,
      onMutate: async ({ id, change }) => {
         await queryClient.cancelQueries({ queryKey: key })
         const previous = queryClient.getQueryData<ShoppingItem[]>(key)
         queryClient.setQueryData<ShoppingItem[]>(key, (items) => items?.map((i) => (i.id === id ? { ...i, ...change } : i)))
         return { previous }
      },
      onSuccess: (item, { change }) => {
         // The server's answer goes straight into the list (refetching everything after each tick
         // queued up reloads and made clearing the basket wait seconds). A newer tick of the same
         // item still on its way wins, so a quick tick-untick doesn't flicker.
         const newer = queryClient.isMutating({ mutationKey: itemChangeKey(hid, listId), predicate: (m) => (m.state.variables as { id?: string } | undefined)?.id === item.id }) > 1
         if (!newer) queryClient.setQueryData<ShoppingItem[]>(key, (items) => items?.map((i) => (i.id === item.id ? item : i)))
         // Ticking only changes the open counts; edits can also teach suggestions and categories.
         if (Object.keys(change).every((k) => k === 'checked')) void queryClient.invalidateQueries({ queryKey: listsKey(hid) })
         else refresh()
      },
      onError: (_e, _v, context) => {
         queryClient.setQueryData(key, context?.previous)
         refresh()
      },
   })
}

export function useDeleteItem(hid: string, listId: string) {
   const queryClient = useQueryClient()
   const refresh = useRefresh(hid)
   const key = itemsKey(hid, listId)
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${base(hid)}/lists/${listId}/items/${id}`)
      },
      onMutate: async (id) => {
         await queryClient.cancelQueries({ queryKey: key })
         const previous = queryClient.getQueryData<ShoppingItem[]>(key)
         queryClient.setQueryData<ShoppingItem[]>(key, (items) => items?.filter((i) => i.id !== id))
         return { previous }
      },
      onError: (_e, _v, context) => queryClient.setQueryData(key, context?.previous),
      onSettled: refresh,
   })
}

/** Ticking items in flight (so clearing the basket can wait for them). */
const itemChangeKey = (hid: string, listId: string) => ['shopping-item-change', hid, listId] as const

export function useClearBasket(hid: string, listId: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async () => {
         // A tick sent a moment ago must reach the server first, or its item would stay behind unticked.
         while (queryClient.isMutating({ mutationKey: itemChangeKey(hid, listId) }) > 0) await new Promise((r) => setTimeout(r, 50))
         return (await api.post<ShoppingItem[]>(`${base(hid)}/lists/${listId}/items/clear-checked`)).data
      },
      onSuccess: (removed) => {
         const gone = new Set(removed.map((i) => i.id))
         queryClient.setQueryData<ShoppingItem[]>(itemsKey(hid, listId), (items) => items?.filter((i) => !gone.has(i.id)))
         void queryClient.invalidateQueries({ queryKey: listsKey(hid) })
      },
   })
}

export function useSaveCategory(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async ({ id, name, icon }: { id: string | null; name: string; icon: string }) =>
         id
            ? (await api.patch<ShoppingCategory>(`${base(hid)}/categories/${id}`, { name, icon })).data
            : (await api.post<ShoppingCategory>(`${base(hid)}/categories`, { name, icon })).data,
      onSuccess: refresh,
   })
}

export function useDeleteCategory(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${base(hid)}/categories/${id}`)
      },
      onSuccess: refresh,
   })
}

export function useOrderCategories(hid: string) {
   const queryClient = useQueryClient()
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async (ids: string[]) => (await api.put<ShoppingCategory[]>(`${base(hid)}/categories/order`, { ids })).data,
      onMutate: async (ids) => {
         const key = categoriesKey(hid)
         await queryClient.cancelQueries({ queryKey: key })
         const previous = queryClient.getQueryData<ShoppingCategory[]>(key)
         queryClient.setQueryData<ShoppingCategory[]>(key, (list) =>
            list && ids.flatMap((id, position) => list.filter((c) => c.id === id).map((c) => ({ ...c, position }))),
         )
         return { previous }
      },
      onError: (_e, _v, context) => queryClient.setQueryData(categoriesKey(hid), context?.previous),
      onSettled: refresh,
   })
}
