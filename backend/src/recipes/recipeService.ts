import { isValidObjectId, type SortOrder } from 'mongoose'
import { parseIngredient } from '../domain/ingredients'
import { aggregateIngredients, ratingAverage, scaleIngredients } from '../domain/recipes'
import { Temporal } from 'temporal-polyfill'
import type { CalendarService } from '../calendar/calendarService'
import type { UnitId } from '../domain/units'
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors'
import { canDeleteShared } from '../households/permissions'
import { extractRecipe } from '../domain/recipeImport'
import { RECIPE_TAG_GROUPS } from '../domain/recipeTags'
import { deleteImage, RECIPE_IMAGES, saveImage } from '../media/images'
import { safeFetch, SafeFetchError } from '../media/safeFetch'
import type { MembershipType } from '../models/membershipModel'
import { CalendarItem } from '../models/calendarItemModel'
import { Recipe } from '../models/recipeModel'
import type { ShoppingService } from '../shopping/shoppingService'
import { realtime } from '../socket/realtime'
import type { RecipeInput, RecipeQuery } from './recipeSchemas'
import { recipeSummary, recipeView } from './recipeViews'

/** Most recipes listed at once (households have hundreds, not thousands). App choice. */
const MAX_LIST = 500

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Page and photo size caps for imports. App choice. */
const MAX_PAGE_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|avif|gif)\b/i

type RecipeServiceDeps = {
   shopping: ShoppingService
   calendar: CalendarService
   imageDir: string
   /** Tests only: let the importer reach a local test server. */
   allowFetchAddress?: (address: string) => boolean
}

export function createRecipeService({ shopping, calendar, imageDir, allowFetchAddress }: RecipeServiceDeps) {
   const fetchOptions = allowFetchAddress ? { allowAddress: allowFetchAddress, allowAnyPort: true } : {}
   /** A fetch problem becomes a 400 with its (user-facing) message. */
   const fetching = async <T>(work: () => Promise<T>): Promise<T> => {
      try {
         return await work()
      } catch (err) {
         if (err instanceof SafeFetchError) throw new BadRequestError(err.message)
         throw err
      }
   }
   const changed = (me: MembershipType) => realtime.householdChanged(me.householdId, 'recipes')

   async function find(me: MembershipType, id: string) {
      const recipe = isValidObjectId(id) ? await Recipe.findOne({ _id: id, householdId: me.householdId }) : null
      if (!recipe) throw new NotFoundError('Recipe not found')
      return recipe
   }

   /** Replaces the photo (the old file is deleted). */
   async function storeImage(me: MembershipType, id: string, image: Buffer) {
      const recipe = await find(me, id)
      const old = recipe.imageUrl
      recipe.imageUrl = await saveImage(image, imageDir, RECIPE_IMAGES)
      await recipe.save()
      await deleteImage(old, imageDir, RECIPE_IMAGES)
      changed(me)
      return recipeView(recipe, me._id)
   }

   const SORTS: Record<RecipeQuery['sort'], Record<string, SortOrder>> = {
      recent: { createdAt: -1 },
      rating: { ratingAvg: -1, createdAt: -1 },
      cooked: { 'cooked.lastAt': -1, createdAt: -1 },
      title: { title: 1 },
   }

   return {
      /** Search: words in the title, a tag or an ingredient; all given tags; at least `minRating` stars on average. */
      async list(me: MembershipType, query: RecipeQuery) {
         const filter: Record<string, unknown> = { householdId: me.householdId }
         if (query.q) {
            const re = new RegExp(escapeRegex(query.q), 'i')
            filter.$or = [{ title: re }, { tags: re }, { 'ingredients.name': re }, { description: re }]
         }
         if (query.tags.length) filter.tags = { $all: query.tags }
         if (query.minRating !== undefined) filter.ratingAvg = { $gte: query.minRating }
         const recipes = await Recipe.find(filter)
            .sort(SORTS[query.sort])
            .collation({ locale: 'de', strength: 2 })
            .limit(MAX_LIST)
            .lean()
         return recipes.map((r) => recipeSummary(r, me._id))
      },

      /** The predefined tags (grouped) and every tag in use, most used first (filter chips). */
      async tags(me: MembershipType) {
         const rows = await Recipe.aggregate<{ _id: string; count: number }>([
            { $match: { householdId: me.householdId } },
            { $unwind: '$tags' },
            { $group: { _id: '$tags', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
         ])
         return { groups: RECIPE_TAG_GROUPS, used: rows.map((r) => ({ tag: r._id, count: r.count })) }
      },

      async get(me: MembershipType, id: string) {
         return recipeView(await find(me, id), me._id)
      },

      async create(me: MembershipType, input: RecipeInput) {
         const recipe = await Recipe.create({ householdId: me.householdId, createdBy: me._id, ...input })
         changed(me)
         return recipeView(recipe, me._id)
      },

      async update(me: MembershipType, id: string, input: RecipeInput) {
         const recipe = await find(me, id)
         recipe.set(input)
         await recipe.save()
         changed(me)
         return recipeView(recipe, me._id)
      },

      async remove(me: MembershipType, id: string) {
         const recipe = await find(me, id)
         if (!canDeleteShared(me.role, recipe.createdBy.equals(me._id))) {
            throw new ForbiddenError('Only the person who added this recipe or an admin can delete it.')
         }
         await recipe.deleteOne()
         // Planned meals keep their title; only the link goes.
         await CalendarItem.updateMany({ householdId: me.householdId, 'meal.recipeId': recipe._id }, { $set: { 'meal.recipeId': null } })
         await deleteImage(recipe.imageUrl, imageDir, RECIPE_IMAGES)
         changed(me)
      },

      setImage: storeImage,

      async removeImage(me: MembershipType, id: string) {
         const recipe = await find(me, id)
         const old = recipe.imageUrl
         recipe.imageUrl = null
         await recipe.save()
         await deleteImage(old, imageDir, RECIPE_IMAGES)
         changed(me)
         return recipeView(recipe, me._id)
      },

      /** Your own stars (null removes them); the average is recomputed. */
      async rate(me: MembershipType, id: string, stars: number | null) {
         const recipe = await find(me, id)
         const others = recipe.ratings.filter((r) => !r.memberId.equals(me._id)).map((r) => ({ memberId: r.memberId, stars: r.stars }))
         const ratings = stars === null ? others : [...others, { memberId: me._id, stars }]
         recipe.set({ ratings, ratingAvg: ratingAverage(ratings) })
         await recipe.save()
         changed(me)
         return recipeView(recipe, me._id)
      },

      async cooked(me: MembershipType, id: string, now: Date) {
         const recipe = await find(me, id)
         recipe.set({ cooked: { count: (recipe.cooked?.count ?? 0) + 1, lastAt: now } })
         await recipe.save()
         changed(me)
         return recipeView(recipe, me._id)
      },

      /** Chosen ingredients, scaled to `servings`, onto a shopping list (merging with what's there). */
      async toList(me: MembershipType, id: string, input: { listId: string; servings: number; ingredients: number[] }) {
         const recipe = await find(me, id)
         const chosen = input.ingredients.map((i) => recipe.ingredients[i])
         if (chosen.some((i) => !i)) throw new BadRequestError('Pick ingredients of this recipe.')
         const scaled = scaleIngredients(
            chosen.flatMap((i) => (i ? [{ name: i.name, quantity: i.quantity ?? null, unit: (i.unit ?? null) as UnitId | null }] : [])),
            recipe.servings,
            input.servings,
         )
         return shopping.addItems(
            me,
            input.listId,
            scaled.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: '', checked: false, fromRecipeIds: [recipe._id.toString()] })),
         )
      },

      /** Reads a recipe page (schema.org data) into a draft; nothing is stored. */
      async importDraft(url: string) {
         const page = await fetching(() => safeFetch(url, { ...fetchOptions, maxBytes: MAX_PAGE_BYTES, accept: 'text/html,application/xhtml+xml' }))
         if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(page.contentType)) throw new BadRequestError('That link isn’t a web page.')
         const draft = extractRecipe(page.body.toString('utf8'), page.url)
         if (!draft) throw new BadRequestError('No recipe found on that page. You can still enter it by hand.')
         return draft
      },

      /** Takes the recipe photo from a web address (e.g. the imported page's image); re-encoded like an upload. */
      async setImageFromUrl(me: MembershipType, id: string, url: string) {
         await find(me, id)
         const image = await fetching(() => safeFetch(url, { ...fetchOptions, maxBytes: MAX_IMAGE_BYTES, accept: 'image/avif,image/webp,image/png,image/jpeg' }))
         if (!IMAGE_TYPES.test(image.contentType)) throw new BadRequestError('That link isn’t a photo.')
         try {
            return await storeImage(me, id, image.body)
         } catch {
            throw new BadRequestError('That photo couldn’t be read.')
         }
      },

      /**
       * Everything the meals planned for local dates [from, to) need: each recipe
       * scaled to its meal's servings, merged where the units add up.
       */
      async mealIngredients(me: MembershipType, query: { from: string; to: string; tz: string }, now: Date) {
         const startOf = (d: string) => Temporal.PlainDate.from(d).toZonedDateTime({ timeZone: query.tz }).toInstant().toString()
         const instances = await calendar.list(me, { from: startOf(query.from), to: startOf(query.to), tz: query.tz, kinds: ['meal'] }, now)
         const ids = [...new Set(instances.flatMap((i) => (i.meal?.recipeId ? [i.meal.recipeId] : [])))]
         const recipes = new Map((await Recipe.find({ _id: { $in: ids }, householdId: me.householdId }).lean()).map((r) => [r._id.toString(), r]))
         const planned = instances.flatMap((i) => {
            const recipe = i.meal?.recipeId ? recipes.get(i.meal.recipeId) : undefined
            if (!recipe || !i.meal) return []
            const lines = recipe.ingredients.map((x) => ({ name: x.name, quantity: x.quantity ?? null, unit: (x.unit ?? null) as UnitId | null }))
            return [{ recipeId: recipe._id.toString(), ingredients: scaleIngredients(lines, recipe.servings, i.meal.servings) }]
         })
         return {
            meals: instances.length,
            withoutRecipe: instances.length - planned.length,
            items: aggregateIngredients(planned).map((item) => ({ ...item, recipes: item.recipeIds.map((id) => recipes.get(id)?.title ?? '') })),
         }
      },

      /** How lines would be read (live preview in the recipe form). */
      parse(lines: string[]) {
         return lines.map(parseIngredient)
      },
   }
}

export type RecipeService = ReturnType<typeof createRecipeService>
