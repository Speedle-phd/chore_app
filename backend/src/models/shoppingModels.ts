import { Schema, model, Types } from 'mongoose'
import type { HydratedDocument, InferSchemaType } from 'mongoose'
import { CATEGORY_ICONS } from '../domain/shoppingCategories'
import { UNIT_IDS } from '../domain/units'

/** A household's shopping list ("Groceries", "Drugstore", "Party" …). */
const shoppingListSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      name: { type: String, required: true, trim: true, maxlength: 60 },
      position: { type: Number, default: 0 },
      createdBy: { type: Types.ObjectId, ref: 'Membership', required: true },
   },
   { timestamps: true },
)
shoppingListSchema.index({ householdId: 1, position: 1 })

/** One line on a list. Checked items are "in the basket" until cleared. */
const shoppingItemSchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      listId: { type: Types.ObjectId, ref: 'ShoppingList', required: true },
      name: { type: String, required: true, trim: true, maxlength: 100 },
      /** Normalized name (domain/shopping.ts `nameKey`) for merging and memory. */
      nameKey: { type: String, required: true },
      quantity: { type: Number, default: null, min: 0 },
      unit: { type: String, enum: [...UNIT_IDS, null], default: null },
      note: { type: String, default: '', maxlength: 200 },
      categoryId: { type: Types.ObjectId, ref: 'ShoppingCategory', default: null },
      checked: { type: Boolean, default: false },
      checkedAt: { type: Date, default: null },
      checkedBy: { type: Types.ObjectId, ref: 'Membership', default: null },
      addedBy: { type: Types.ObjectId, ref: 'Membership', required: true },
      /** Recipes the amount came from (for "from: Lasagne"). */
      fromRecipeIds: { type: [{ type: Types.ObjectId, ref: 'Recipe' }], default: [] },
   },
   { timestamps: true },
)
shoppingItemSchema.index({ listId: 1, checked: 1 })
shoppingItemSchema.index({ householdId: 1 })

/** Store sections; the order is the walk through the shop. `key` links seeded ones to catalog defaults. */
const shoppingCategorySchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      key: { type: String, default: null },
      name: { type: String, required: true, trim: true, maxlength: 40 },
      icon: { type: String, enum: CATEGORY_ICONS, default: 'package' },
      position: { type: Number, default: 0 },
   },
   { timestamps: true },
)
shoppingCategorySchema.index({ householdId: 1, position: 1 })

/** What a household has bought before: powers suggestions and remembers category, unit and amount. */
const itemMemorySchema = new Schema(
   {
      householdId: { type: Types.ObjectId, ref: 'Household', required: true },
      nameKey: { type: String, required: true },
      name: { type: String, required: true },
      categoryId: { type: Types.ObjectId, ref: 'ShoppingCategory', default: null },
      unit: { type: String, enum: [...UNIT_IDS, null], default: null },
      quantity: { type: Number, default: null },
      uses: { type: Number, default: 0 },
      lastUsedAt: { type: Date, required: true },
   },
   { timestamps: true },
)
itemMemorySchema.index({ householdId: 1, nameKey: 1 }, { unique: true })

export type ShoppingListType = HydratedDocument<InferSchemaType<typeof shoppingListSchema>>
export type ShoppingItemType = HydratedDocument<InferSchemaType<typeof shoppingItemSchema>>
export type ShoppingCategoryType = HydratedDocument<InferSchemaType<typeof shoppingCategorySchema>>
export const ShoppingList = model('ShoppingList', shoppingListSchema)
export const ShoppingItem = model('ShoppingItem', shoppingItemSchema)
export const ShoppingCategory = model('ShoppingCategory', shoppingCategorySchema)
export const ItemMemory = model('ItemMemory', itemMemorySchema)
