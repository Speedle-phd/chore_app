import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { parseIngredient } from '../domain/ingredients'
import { normalizeTags } from '../domain/recipeTags'
import { isTimeZone } from '../domain/recurrence'

const objectId = z.string().refine(isValidObjectId, 'Invalid id.')
const minutes = z.number().int().min(0).max(2880).nullable().default(null)

/**
 * Create or replace a recipe. Ingredients come as written lines; the server
 * parses them (domain/ingredients.ts), so every client gets the same result.
 */
export const recipeInputSchema = z.object({
   title: z.string().trim().min(1, 'Enter a title.').max(120),
   description: z.string().trim().max(2000).default(''),
   servings: z.number().int().min(1).max(100).default(4),
   prepMinutes: minutes,
   cookMinutes: minutes,
   ingredients: z
      .array(z.string().trim().max(200))
      .max(100)
      .default([])
      .transform((lines) => lines.filter(Boolean).map(parseIngredient)),
   steps: z
      .array(z.string().trim().max(4000))
      .max(100)
      .default([])
      .transform((steps) => steps.filter(Boolean)),
   tags: z.array(z.string().max(30)).max(20).default([]).transform(normalizeTags),
   sourceUrl: z.url({ protocol: /^https?$/ }).max(2000).nullable().default(null),
})
export type RecipeInput = z.output<typeof recipeInputSchema>

export const RECIPE_SORTS = ['recent', 'rating', 'cooked', 'title'] as const
export const recipeQuerySchema = z.object({
   q: z.string().trim().max(100).default(''),
   tags: z
      .string()
      .max(1000)
      .default('')
      .transform((s) => normalizeTags(s.split(','))),
   minRating: z.coerce.number().min(1).max(5).optional(),
   sort: z.enum(RECIPE_SORTS).default('recent'),
})
export type RecipeQuery = z.output<typeof recipeQuerySchema>

export const ratingSchema = z.object({ stars: z.number().int().min(1).max(5).nullable() })

export const toListSchema = z.object({
   listId: objectId,
   servings: z.number().int().min(1).max(100),
   /** Indexes of the ingredients to add (the rest are "already have"). */
   ingredients: z
      .array(z.number().int().min(0).max(99))
      .min(1, 'Pick at least one ingredient.')
      .max(100)
      .refine((ix) => new Set(ix).size === ix.length, 'Each ingredient only once.'),
})

/** Local dates [from, to) of the meal plan, at most two months. */
export const mealPeriodSchema = z
   .object({ from: z.iso.date(), to: z.iso.date(), tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone.') })
   .refine((q) => q.from < q.to, { message: '`from` must be before `to`.', path: ['to'] })
   .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 62 * 86_400_000, { message: 'Ask for at most two months.', path: ['to'] })

export const importSchema = z.object({ url: z.url({ protocol: /^https?$/ }).max(2000) })

export const parseLinesSchema = z.object({ lines: z.array(z.string().max(200)).max(100) })
