import type { UnitId } from '@/features/shopping/units'
import { RECIPE_SORTS, type Ingredient, type RecipeQuery, type RecipeSort } from './recipesApi'

/** Same rounding as the server (backend/src/domain/recipes.ts `roundAmount`), for the servings preview. */
export function roundAmount(quantity: number, unit: UnitId | null): number {
   if (unit === 'g' || unit === 'ml') return quantity >= 20 ? Math.max(5, Math.round(quantity / 5) * 5) : Math.max(1, Math.round(quantity))
   if (unit === 'kg' || unit === 'l') return Math.round(quantity * 100) / 100
   return Math.max(0.25, Math.round(quantity * 4) / 4)
}

export function scaleIngredient(i: Ingredient, from: number, to: number): Ingredient {
   if (i.quantity === null || from === to) return i
   return { ...i, quantity: roundAmount((i.quantity * to) / from, i.unit) }
}

/** "45 min", "1 h", "1 h 15 min". */
export function formatMinutes(minutes: number | null): string {
   if (minutes === null) return ''
   const h = Math.floor(minutes / 60)
   const m = minutes % 60
   return [h ? `${h} h` : '', m || !h ? `${m} min` : ''].filter(Boolean).join(' ')
}

/** Search state ↔ URL (?q=…&tags=a,b&min=4&sort=rating), so searches can be linked and survive reloads. */
export function queryFromParams(params: URLSearchParams): RecipeQuery {
   const sort = RECIPE_SORTS.find((s) => s.id === params.get('sort'))?.id ?? 'recent'
   const min = Number(params.get('min'))
   return {
      q: params.get('q') ?? '',
      tags: (params.get('tags') ?? '').split(',').filter(Boolean),
      minRating: min >= 1 && min <= 5 ? min : null,
      sort,
   }
}

export function paramsFromQuery(query: RecipeQuery, tab?: string): Record<string, string> {
   const out: Record<string, string> = {}
   if (tab) out.tab = tab
   if (query.q) out.q = query.q
   if (query.tags.length) out.tags = query.tags.join(',')
   if (query.minRating) out.min = String(query.minRating)
   if (query.sort !== ('recent' satisfies RecipeSort)) out.sort = query.sort
   return out
}
