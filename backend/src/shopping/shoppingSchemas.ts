import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { CATEGORY_ICONS } from '../domain/shoppingCategories'
import { UNIT_IDS } from '../domain/units'

const objectId = z.string().refine(isValidObjectId, 'Invalid id.')

export const listInputSchema = z.object({ name: z.string().trim().min(1, 'Enter a name.').max(60) })
export const listUpdateSchema = z
   .object({ name: z.string().trim().min(1, 'Enter a name.').max(60).optional(), position: z.number().int().min(0).max(1000).optional() })
   .refine((b) => b.name !== undefined || b.position !== undefined, 'Nothing to change.')

const quantity = z.number().positive('Use an amount above 0.').max(100_000).nullable()
const unit = z.enum(UNIT_IDS).nullable()

export const itemInputSchema = z.object({
   name: z.string().trim().min(1, 'Enter what to buy.').max(100),
   quantity: quantity.default(null),
   unit: unit.default(null),
   note: z.string().trim().max(200).default(''),
   /** Omitted: the remembered or catalog category. Null: no category. */
   categoryId: objectId.nullable().optional(),
   /** Put straight into the basket (used to undo "clear basket"). */
   checked: z.boolean().default(false),
   fromRecipeIds: z.array(objectId).max(20).default([]),
})
export type ItemInput = z.output<typeof itemInputSchema>

export const itemBatchSchema = z.object({ items: z.array(itemInputSchema).min(1).max(200) })

export const itemUpdateSchema = z
   .object({
      name: z.string().trim().min(1, 'Enter what to buy.').max(100).optional(),
      quantity: quantity.optional(),
      unit: unit.optional(),
      note: z.string().trim().max(200).optional(),
      categoryId: objectId.nullable().optional(),
      checked: z.boolean().optional(),
   })
   .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change.')
export type ItemUpdate = z.output<typeof itemUpdateSchema>

export const suggestionQuerySchema = z.object({ q: z.string().max(100).default('') })

export const categoryInputSchema = z.object({
   name: z.string().trim().min(1, 'Enter a name.').max(40),
   icon: z.enum(CATEGORY_ICONS).default('package'),
})
export const categoryUpdateSchema = z
   .object({ name: z.string().trim().min(1, 'Enter a name.').max(40).optional(), icon: z.enum(CATEGORY_ICONS).optional() })
   .refine((b) => b.name !== undefined || b.icon !== undefined, 'Nothing to change.')
export const categoryOrderSchema = z.object({
   ids: z
      .array(objectId)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Each category only once.'),
})
