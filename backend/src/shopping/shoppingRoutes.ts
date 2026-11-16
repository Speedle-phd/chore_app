import { Router, type Request } from 'express'
import { UnauthorizedError } from '../errors'
import type { MembershipType } from '../models/membershipModel'
import {
   categoryInputSchema,
   categoryOrderSchema,
   categoryUpdateSchema,
   itemBatchSchema,
   itemInputSchema,
   itemUpdateSchema,
   listInputSchema,
   listUpdateSchema,
   suggestionQuerySchema,
} from './shoppingSchemas'
import type { ShoppingService } from './shoppingService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const param = (req: Request, name: string) => String(req.params[name])

/** Mounted under /api/households/:hid/shopping (membership checked). */
export function createShoppingRoutes(shopping: ShoppingService) {
   const router = Router({ mergeParams: true })

   router.get('/lists', async (req, res) => {
      res.json(await shopping.lists(me(req)))
   })
   router.post('/lists', async (req, res) => {
      res.status(201).json(await shopping.createList(me(req), listInputSchema.parse(req.body).name))
   })
   router.patch('/lists/:id', async (req, res) => {
      res.json(await shopping.updateList(me(req), param(req, 'id'), listUpdateSchema.parse(req.body)))
   })
   router.delete('/lists/:id', async (req, res) => {
      await shopping.removeList(me(req), param(req, 'id'))
      res.status(204).end()
   })

   router.get('/lists/:id/items', async (req, res) => {
      res.json(await shopping.items(me(req), param(req, 'id')))
   })
   router.post('/lists/:id/items', async (req, res) => {
      res.status(201).json(await shopping.addItem(me(req), param(req, 'id'), itemInputSchema.parse(req.body)))
   })
   router.post('/lists/:id/items/batch', async (req, res) => {
      res.status(201).json(await shopping.addItems(me(req), param(req, 'id'), itemBatchSchema.parse(req.body).items))
   })
   router.post('/lists/:id/items/clear-checked', async (req, res) => {
      res.json(await shopping.clearChecked(me(req), param(req, 'id')))
   })
   router.patch('/lists/:id/items/:itemId', async (req, res) => {
      res.json(await shopping.updateItem(me(req), param(req, 'id'), param(req, 'itemId'), itemUpdateSchema.parse(req.body)))
   })
   router.delete('/lists/:id/items/:itemId', async (req, res) => {
      await shopping.removeItem(me(req), param(req, 'id'), param(req, 'itemId'))
      res.status(204).end()
   })

   router.get('/suggestions', async (req, res) => {
      res.json(await shopping.suggestions(me(req), suggestionQuerySchema.parse(req.query).q))
   })

   router.get('/categories', async (req, res) => {
      res.json(await shopping.categories(me(req)))
   })
   router.post('/categories', async (req, res) => {
      res.status(201).json(await shopping.createCategory(me(req), categoryInputSchema.parse(req.body)))
   })
   // Static path before /:id.
   router.put('/categories/order', async (req, res) => {
      res.json(await shopping.orderCategories(me(req), categoryOrderSchema.parse(req.body).ids))
   })
   router.patch('/categories/:id', async (req, res) => {
      res.json(await shopping.updateCategory(me(req), param(req, 'id'), categoryUpdateSchema.parse(req.body)))
   })
   router.delete('/categories/:id', async (req, res) => {
      await shopping.removeCategory(me(req), param(req, 'id'))
      res.status(204).end()
   })

   return router
}
