import type { Ingredient } from './ingredients'
import { nameKey } from './shopping'
import { addAmounts, normalize, type UnitId } from './units'

/** A sensible amount after scaling: whole grams/millilitres (to 5 from 20), else quarters. App choice. */
export function roundAmount(quantity: number, unit: UnitId | null): number {
   if (unit === 'g' || unit === 'ml') return quantity >= 20 ? Math.max(5, Math.round(quantity / 5) * 5) : Math.max(1, Math.round(quantity))
   if (unit === 'kg' || unit === 'l') return Math.round(quantity * 100) / 100
   return Math.max(0.25, Math.round(quantity * 4) / 4)
}

/** Ingredients for another number of servings (amount-less ones stay as they are). */
export function scaleIngredients<T extends Pick<Ingredient, 'quantity' | 'unit'>>(ingredients: T[], from: number, to: number): T[] {
   if (from <= 0 || to <= 0 || from === to) return ingredients
   const factor = to / from
   return ingredients.map((i) => (i.quantity === null ? i : { ...i, quantity: roundAmount(i.quantity * factor, i.unit) }))
}

export type NeededItem = { name: string; quantity: number | null; unit: UnitId | null; recipeIds: string[] }

/**
 * Everything several planned meals need, merged by name where the units add up
 * ("200 g Mehl" + "0.5 kg Mehl" = "700 g Mehl"); otherwise separate lines. Order: first use.
 */
export function aggregateIngredients(meals: { recipeId: string; ingredients: Pick<Ingredient, 'name' | 'quantity' | 'unit'>[] }[]): NeededItem[] {
   const out: (NeededItem & { key: string })[] = []
   for (const meal of meals) {
      for (const i of meal.ingredients) {
         const key = nameKey(i.name)
         let merged = false
         for (const line of out) {
            if (line.key !== key) continue
            const sum = addAmounts(line, i)
            if (!sum) continue
            line.quantity = sum.quantity
            line.unit = sum.unit
            if (!line.recipeIds.includes(meal.recipeId)) line.recipeIds.push(meal.recipeId)
            merged = true
            break
         }
         if (!merged) out.push({ key, name: i.name, ...normalize({ quantity: i.quantity, unit: i.unit }), recipeIds: [meal.recipeId] })
      }
   }
   return out.map(({ key: _key, ...line }) => line)
}

/** Average of the members' stars (one decimal), null when nobody rated. */
export function ratingAverage(ratings: { stars: number }[]): number | null {
   if (!ratings.length) return null
   return Math.round((ratings.reduce((s, r) => s + r.stars, 0) / ratings.length) * 10) / 10
}

