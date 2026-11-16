import { Router, type Request, type RequestHandler } from 'express'
import { UnauthorizedError } from '../errors'
import { recipeImageUpload } from '../middleware/recipeImageUpload'
import type { MembershipType } from '../models/membershipModel'
import { importSchema, mealPeriodSchema, parseLinesSchema, ratingSchema, recipeInputSchema, recipeQuerySchema, toListSchema } from './recipeSchemas'
import type { RecipeService } from './recipeService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const id = (req: Request) => String(req.params.id)

/** Mounted under /api/households/:hid/recipes (membership checked). `importLimit` guards the endpoints that fetch other websites. */
export function createRecipeRoutes(recipes: RecipeService, importLimit: RequestHandler) {
   const router = Router({ mergeParams: true })

   router.get('/', async (req, res) => {
      res.json(await recipes.list(me(req), recipeQuerySchema.parse(req.query)))
   })
   router.post('/', async (req, res) => {
      res.status(201).json(await recipes.create(me(req), recipeInputSchema.parse(req.body)))
   })
   // Static paths before /:id.
   router.get('/tags', async (req, res) => {
      res.json(await recipes.tags(me(req)))
   })
   router.post('/import', importLimit, async (req, res) => {
      me(req)
      res.json(await recipes.importDraft(importSchema.parse(req.body).url))
   })
   router.get('/meal-ingredients', async (req, res) => {
      res.json(await recipes.mealIngredients(me(req), mealPeriodSchema.parse(req.query), new Date()))
   })
   router.post('/parse', (req, res) => {
      me(req)
      res.json(recipes.parse(parseLinesSchema.parse(req.body).lines))
   })

   router.get('/:id', async (req, res) => {
      res.json(await recipes.get(me(req), id(req)))
   })
   router.put('/:id', async (req, res) => {
      res.json(await recipes.update(me(req), id(req), recipeInputSchema.parse(req.body)))
   })
   router.delete('/:id', async (req, res) => {
      await recipes.remove(me(req), id(req))
      res.status(204).end()
   })
   router.put('/:id/image', recipeImageUpload, async (req, res) => {
      res.json(await recipes.setImage(me(req), id(req), req.file?.buffer ?? Buffer.alloc(0)))
   })
   router.put('/:id/image-from-url', importLimit, async (req, res) => {
      res.json(await recipes.setImageFromUrl(me(req), id(req), importSchema.parse(req.body).url))
   })
   router.delete('/:id/image', async (req, res) => {
      res.json(await recipes.removeImage(me(req), id(req)))
   })
   router.put('/:id/rating', async (req, res) => {
      res.json(await recipes.rate(me(req), id(req), ratingSchema.parse(req.body).stars))
   })
   router.post('/:id/cooked', async (req, res) => {
      res.json(await recipes.cooked(me(req), id(req), new Date()))
   })
   router.post('/:id/to-list', async (req, res) => {
      res.status(201).json(await recipes.toList(me(req), id(req), toListSchema.parse(req.body)))
   })

   return router
}
