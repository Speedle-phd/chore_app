import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { MAX_AMOUNT, MAX_TRIP_DAYS, PACKING_SECTIONS } from '../domain/packing'
import { MAX_TEMPLATE_ITEMS } from '../models/packingModels'

const objectId = z.string().refine(isValidObjectId, 'Invalid id.')
const name = z.string().trim().min(1, 'Enter a name.').max(60)
const text = z.string().trim().min(1, 'Enter what to pack.').max(100)
const section = z.enum(PACKING_SECTIONS)
const people = z
   .array(objectId)
   .max(50)
   .refine((ids) => new Set(ids).size === ids.length, 'Each person only once.')

const quantity = z.number().int('Use a whole number.').min(1, 'Use at least 1.').max(MAX_AMOUNT, `At most ${MAX_AMOUNT}.`)
const days = z.number().int().min(1).max(MAX_TRIP_DAYS)

/** Fixed amounts are whole things; per day may be halves (½ = one every second day). A cap only applies per day. */
const templateItem = z
   .object({
      text,
      section,
      perPerson: z.boolean().default(false),
      amount: z.number().positive('Use an amount above 0.').max(MAX_AMOUNT).nullable().default(null),
      perDay: z.boolean().default(false),
      maxAmount: quantity.nullable().default(null),
   })
   .strict()
   .refine((i) => i.amount === null || (i.perDay ? Number.isInteger(i.amount * 2) : Number.isInteger(i.amount)), {
      message: 'Use a whole number (per day also ½ steps).',
      path: ['amount'],
   })
   .transform((i) => {
      const perDay = i.perDay && i.amount !== null
      return { ...i, perDay, maxAmount: perDay ? i.maxAmount : null }
   })

export const templateInputSchema = z
   .object({
      name,
      items: z.array(templateItem).max(MAX_TEMPLATE_ITEMS, `At most ${MAX_TEMPLATE_ITEMS} items.`),
   })
   .strict()
export type TemplateInput = z.output<typeof templateInputSchema>

export const templateUpdateSchema = templateInputSchema.partial().refine((b) => b.name !== undefined || b.items !== undefined, 'Nothing to change.')

export const listInputSchema = z
   .object({
      name,
      templateId: objectId.nullable().default(null),
      vacationId: objectId.nullable().default(null),
      travellerIds: people.default([]),
      days: days.nullable().default(null),
   })
   .strict()
export type ListInput = z.output<typeof listInputSchema>

export const listUpdateSchema = z
   .object({
      name: name.optional(),
      archived: z.boolean().optional(),
      days: days.nullable().optional(),
      travellerIds: people.optional(),
      /** With new travellers: give them the list’s personal items (default yes). */
      copyItems: z.boolean().optional(),
   })
   .strict()
   .refine((b) => b.name !== undefined || b.archived !== undefined || b.days !== undefined || b.travellerIds !== undefined, 'Nothing to change.')

export const itemInputSchema = z
   .object({ text, section, memberId: objectId.nullable().default(null), quantity: quantity.nullable().default(null) })
   .strict()
export type ItemInput = z.output<typeof itemInputSchema>

export const itemUpdateSchema = z
   .object({
      text: text.optional(),
      section: section.optional(),
      memberId: objectId.nullable().optional(),
      quantity: quantity.nullable().optional(),
      checked: z.boolean().optional(),
   })
   .strict()
   .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change.')
export type ItemUpdate = z.output<typeof itemUpdateSchema>

export const toShoppingSchema = z.object({ shoppingListId: objectId }).strict()
export const saveAsTemplateSchema = z.object({ name }).strict()

