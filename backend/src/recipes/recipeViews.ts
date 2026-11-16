import type { Types } from 'mongoose'
import type { Ingredient } from '../domain/ingredients'

type StoredRecipe = {
   _id: Types.ObjectId
   title: string
   description?: string | null
   servings: number
   prepMinutes?: number | null
   cookMinutes?: number | null
   ingredients: { text: string; quantity?: number | null; unit?: string | null; name: string; note?: string | null }[]
   steps: string[]
   tags: string[]
   imageUrl?: string | null
   sourceUrl?: string | null
   ratings: { memberId: Types.ObjectId; stars: number }[]
   ratingAvg?: number | null
   cooked?: { count?: number | null; lastAt?: Date | null } | null
   createdBy: Types.ObjectId
   createdAt: Date
   updatedAt: Date
}

/** A card in the recipe grid. `myRating`: the viewer's own stars. */
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

export type RecipeView = RecipeSummary & {
   description: string
   prepMinutes: number | null
   cookMinutes: number | null
   ingredients: Ingredient[]
   steps: string[]
   sourceUrl: string | null
   createdAt: string
   updatedAt: string
}

const total = (r: StoredRecipe) => (r.prepMinutes ?? null) === null && (r.cookMinutes ?? null) === null ? null : (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0)

export function recipeSummary(r: StoredRecipe, me: Types.ObjectId): RecipeSummary {
   return {
      id: r._id.toString(),
      title: r.title,
      servings: r.servings,
      imageUrl: r.imageUrl ?? null,
      tags: [...r.tags],
      totalMinutes: total(r),
      ratingAvg: r.ratingAvg ?? null,
      ratingCount: r.ratings.length,
      myRating: r.ratings.find((x) => x.memberId.equals(me))?.stars ?? null,
      cookedCount: r.cooked?.count ?? 0,
      lastCookedAt: r.cooked?.lastAt?.toISOString() ?? null,
      createdBy: r.createdBy.toString(),
   }
}

export function recipeView(r: StoredRecipe, me: Types.ObjectId): RecipeView {
   return {
      ...recipeSummary(r, me),
      description: r.description ?? '',
      prepMinutes: r.prepMinutes ?? null,
      cookMinutes: r.cookMinutes ?? null,
      ingredients: r.ingredients.map((i) => ({
         text: i.text,
         quantity: i.quantity ?? null,
         unit: (i.unit ?? null) as Ingredient['unit'],
         name: i.name,
         note: i.note ?? '',
      })),
      steps: [...r.steps],
      sourceUrl: r.sourceUrl ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
   }
}
