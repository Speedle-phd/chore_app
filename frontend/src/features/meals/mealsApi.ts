import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { viewerTimeZone } from '@/features/calendar/time'
import type { UnitId } from '@/features/shopping/units'

/** Server: recipeService.mealIngredients */
export type MealIngredients = {
   meals: number
   withoutRecipe: number
   items: { name: string; quantity: number | null; unit: UnitId | null; recipeIds: string[]; recipes: string[] }[]
}

/** What the meals planned for local dates [from, to) need. Under the calendar prefix: meal changes refresh it. */
export function useMealIngredients(hid: string, from: string, to: string, enabled: boolean) {
   return useQuery({
      queryKey: ['household', hid, 'calendar', 'meal-ingredients', from, to] as const,
      queryFn: async () => (await api.get<MealIngredients>(`/households/${hid}/recipes/meal-ingredients`, { params: { from, to, tz: viewerTimeZone() } })).data,
      enabled,
   })
}
