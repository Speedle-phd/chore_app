import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { shoppingKey } from '@/features/shopping/shoppingApi'
import type { UnitId } from '@/features/shopping/units'

/** Server: backend/src/recipes/recipeViews.ts */
export type Ingredient = { text: string; quantity: number | null; unit: UnitId | null; name: string; note: string }
export type RecipeSummary = {
   id: string
   title: string
   servings: number
   imageUrl: string | null
   tags: string[]
   totalMinutes: number | null
   ratingAvg: number | null
   ratingCount: number
   myRating: number | null
   cookedCount: number
   lastCookedAt: string | null
   createdBy: string
}
export type Recipe = RecipeSummary & {
   description: string
   prepMinutes: number | null
   cookMinutes: number | null
   ingredients: Ingredient[]
   steps: string[]
   sourceUrl: string | null
   createdAt: string
   updatedAt: string
}
/** What the form sends: ingredients as written lines (the server parses them). */
export type RecipeInput = {
   title: string
   description: string
   servings: number
   prepMinutes: number | null
   cookMinutes: number | null
   ingredients: string[]
   steps: string[]
   tags: string[]
   sourceUrl: string | null
}
/** Server: backend/src/domain/recipeImport.ts */
export type ImportDraft = {
   title: string
   description: string
   servings: number | null
   prepMinutes: number | null
   cookMinutes: number | null
   ingredients: string[]
   steps: string[]
   tags: string[]
   imageUrl: string | null
   sourceUrl: string
   complete: boolean
}

export const RECIPE_SORTS = [
   { id: 'recent', label: 'Newest' },
   { id: 'rating', label: 'Best rated' },
   { id: 'cooked', label: 'Recently cooked' },
   { id: 'title', label: 'A–Z' },
] as const
export type RecipeSort = (typeof RECIPE_SORTS)[number]['id']
export type RecipeQuery = { q: string; tags: string[]; minRating: number | null; sort: RecipeSort }

const base = (hid: string) => `/households/${hid}/recipes`
export const recipesKey = (hid: string) => ['household', hid, 'recipes'] as const
const recipeKey = (hid: string, id: string) => [...recipesKey(hid), 'one', id] as const

export function useRecipes(hid: string, query: RecipeQuery) {
   return useQuery({
      queryKey: [...recipesKey(hid), 'list', query] as const,
      queryFn: async () =>
         (
            await api.get<RecipeSummary[]>(base(hid), {
               params: { q: query.q, tags: query.tags.join(','), sort: query.sort, ...(query.minRating ? { minRating: query.minRating } : {}) },
            })
         ).data,
      placeholderData: keepPreviousData,
   })
}

/** Server: backend/src/domain/recipeTags.ts */
export type TagGroup = { id: string; label: string; tags: readonly string[] }

/** The predefined tags (grouped) and the tags in use (most used first). */
export function useRecipeTags(hid: string) {
   return useQuery({
      queryKey: [...recipesKey(hid), 'tags'] as const,
      queryFn: async () => (await api.get<{ groups: TagGroup[]; used: { tag: string; count: number }[] }>(`${base(hid)}/tags`)).data,
      staleTime: 60_000,
   })
}

export function useRecipe(hid: string, id: string | null) {
   return useQuery({
      queryKey: recipeKey(hid, id ?? ''),
      queryFn: async () => (await api.get<Recipe>(`${base(hid)}/${id}`)).data,
      enabled: Boolean(id),
   })
}

/** After a write: the saved recipe into its cache, lists and tags refetched (not awaited). */
function useSaved(hid: string) {
   const queryClient = useQueryClient()
   return (recipe?: Recipe) => {
      if (recipe) queryClient.setQueryData(recipeKey(hid, recipe.id), recipe)
      void queryClient.invalidateQueries({ queryKey: recipesKey(hid) })
   }
}

export function useSaveRecipe(hid: string, id: string | null) {
   const saved = useSaved(hid)
   return useMutation({
      mutationFn: async (input: RecipeInput) =>
         id ? (await api.put<Recipe>(`${base(hid)}/${id}`, input)).data : (await api.post<Recipe>(base(hid), input)).data,
      onSuccess: saved,
   })
}

export function useDeleteRecipe(hid: string) {
   const saved = useSaved(hid)
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${base(hid)}/${id}`)
      },
      onSuccess: () => saved(),
   })
}

/** Photo: upload a file, take it from a web address (imports), or remove it (null). */
export function useRecipeImage(hid: string) {
   const saved = useSaved(hid)
   return useMutation({
      mutationFn: async ({ id, file }: { id: string; file: File | { url: string } | null }) => {
         if (!file) return (await api.delete<Recipe>(`${base(hid)}/${id}/image`)).data
         if (!(file instanceof File)) return (await api.put<Recipe>(`${base(hid)}/${id}/image-from-url`, { url: file.url }, { timeout: 30_000 })).data
         const form = new FormData()
         form.append('image', file)
         return (await api.put<Recipe>(`${base(hid)}/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 })).data
      },
      onSuccess: saved,
   })
}

export function useRateRecipe(hid: string, id: string) {
   const saved = useSaved(hid)
   return useMutation({
      mutationFn: async (stars: number | null) => (await api.put<Recipe>(`${base(hid)}/${id}/rating`, { stars })).data,
      onSuccess: saved,
   })
}

export function useCookedRecipe(hid: string, id: string) {
   const saved = useSaved(hid)
   return useMutation({
      mutationFn: async () => (await api.post<Recipe>(`${base(hid)}/${id}/cooked`)).data,
      onSuccess: saved,
   })
}

export function useRecipeToList(hid: string, id: string) {
   const queryClient = useQueryClient()
   return useMutation({
      mutationFn: async (input: { listId: string; servings: number; ingredients: number[] }) =>
         (await api.post<unknown[]>(`${base(hid)}/${id}/to-list`, input)).data,
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: shoppingKey(hid) }),
   })
}

/** Reads a recipe page into a draft (nothing is saved). */
export function useImportRecipe(hid: string) {
   return useMutation({
      mutationFn: async (url: string) => (await api.post<ImportDraft>(`${base(hid)}/import`, { url }, { timeout: 30_000 })).data,
   })
}

/** How the server reads ingredient lines (preview in the form). */
export function useParsedLines(hid: string, lines: string[]) {
   return useQuery({
      queryKey: [...recipesKey(hid), 'parse', lines] as const,
      queryFn: async () => (await api.post<Ingredient[]>(`${base(hid)}/parse`, { lines })).data,
      enabled: lines.length > 0,
      placeholderData: keepPreviousData,
      staleTime: Infinity,
   })
}
