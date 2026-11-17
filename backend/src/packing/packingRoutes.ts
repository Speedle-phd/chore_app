import { Router, type Request } from 'express'
import { UnauthorizedError } from '../errors'
import type { MembershipType } from '../models/membershipModel'
import {
   itemInputSchema,
   itemUpdateSchema,
   listInputSchema,
   listUpdateSchema,
   saveAsTemplateSchema,
   templateInputSchema,
   templateUpdateSchema,
   toShoppingSchema,
} from './packingSchemas'
import type { PackingService } from './packingService'

const me = (req: Request): MembershipType => {
   if (!req.membership) throw new UnauthorizedError('Not signed in')
   return req.membership
}
const param = (req: Request, name: string) => String(req.params[name])

/** Mounted under /api/households/:hid/packing (membership checked). */
export function createPackingRoutes(packing: PackingService) {
   const router = Router({ mergeParams: true })

   router.get('/templates', async (req, res) => {
      res.json(await packing.templates(me(req)))
   })
   router.post('/templates', async (req, res) => {
      res.status(201).json(await packing.createTemplate(me(req), templateInputSchema.parse(req.body)))
   })
   router.patch('/templates/:id', async (req, res) => {
      res.json(await packing.updateTemplate(me(req), param(req, 'id'), templateUpdateSchema.parse(req.body)))
   })
   router.delete('/templates/:id', async (req, res) => {
      await packing.removeTemplate(me(req), param(req, 'id'))
      res.status(204).end()
   })

   router.get('/lists', async (req, res) => {
      res.json(await packing.lists(me(req)))
   })
   router.post('/lists', async (req, res) => {
      res.status(201).json(await packing.createList(me(req), listInputSchema.parse(req.body)))
   })
   router.get('/lists/:id', async (req, res) => {
      res.json(await packing.list(me(req), param(req, 'id')))
   })
   router.patch('/lists/:id', async (req, res) => {
      res.json(await packing.updateList(me(req), param(req, 'id'), listUpdateSchema.parse(req.body)))
   })
   router.delete('/lists/:id', async (req, res) => {
      await packing.removeList(me(req), param(req, 'id'))
      res.status(204).end()
   })
   router.post('/lists/:id/to-shopping', async (req, res) => {
      res.json(await packing.toShopping(me(req), param(req, 'id'), toShoppingSchema.parse(req.body).shoppingListId))
   })
   router.post('/lists/:id/save-as-template', async (req, res) => {
      res.status(201).json(await packing.saveAsTemplate(me(req), param(req, 'id'), saveAsTemplateSchema.parse(req.body).name))
   })

   router.post('/lists/:id/items', async (req, res) => {
      res.status(201).json(await packing.addItem(me(req), param(req, 'id'), itemInputSchema.parse(req.body)))
   })
   router.patch('/lists/:id/items/:itemId', async (req, res) => {
      res.json(await packing.updateItem(me(req), param(req, 'id'), param(req, 'itemId'), itemUpdateSchema.parse(req.body)))
   })
   router.delete('/lists/:id/items/:itemId', async (req, res) => {
      res.json(await packing.removeItem(me(req), param(req, 'id'), param(req, 'itemId')))
   })

   return router
}
