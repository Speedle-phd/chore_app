import { isValidObjectId, type Types } from 'mongoose'
import { GROCERY_CATALOG_DE } from '../domain/groceryCatalog.de'
import { mergeInto, nameKey, suggest, type Remembered } from '../domain/shopping'
import { DEFAULT_CATEGORIES, type CategoryIcon } from '../domain/shoppingCategories'
import type { UnitId } from '../domain/units'
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors'
import { canDeleteShared } from '../households/permissions'
import { Household } from '../models/householdModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { ItemMemory, ShoppingCategory, ShoppingItem, ShoppingList } from '../models/shoppingModels'
import { realtime } from '../socket/realtime'
import type { ItemInput, ItemUpdate } from './shoppingSchemas'
import { categoryView, itemView, listView } from './shoppingViews'

/** Name of the list every household starts with. App choice. */
export const FIRST_LIST_NAME = 'Groceries'
/** Remembered items considered for suggestions (most used first). */
const MEMORY_SCAN = 2000

export function createShoppingService() {
   const changed = (me: MembershipType) => realtime.householdChanged(me.householdId, 'shopping')

   /** Default categories and the first list, created once per household (claimed atomically). */
   async function ensureSeeded(me: MembershipType) {
      const claim = await Household.updateOne({ _id: me.householdId, shoppingSeededAt: null }, { $set: { shoppingSeededAt: new Date() } })
      if (claim.modifiedCount !== 1) return
      await ShoppingCategory.insertMany(DEFAULT_CATEGORIES.map((c, position) => ({ householdId: me.householdId, ...c, position })))
      // The household's list, not whoever happened to open the page first: credited to the (first) owner.
      const owner = await Membership.findOne({ householdId: me.householdId, role: 'owner' }).sort({ createdAt: 1 }).select('_id').lean()
      await ShoppingList.create({ householdId: me.householdId, name: FIRST_LIST_NAME, position: 0, createdBy: owner?._id ?? me._id })
   }

   async function findList(me: MembershipType, id: string) {
      const list = isValidObjectId(id) ? await ShoppingList.findOne({ _id: id, householdId: me.householdId }) : null
      if (!list) throw new NotFoundError('List not found')
      return list
   }

   async function findItem(me: MembershipType, listId: string, itemId: string) {
      const item = isValidObjectId(itemId) && isValidObjectId(listId)
         ? await ShoppingItem.findOne({ _id: itemId, listId, householdId: me.householdId })
         : null
      if (!item) throw new NotFoundError('Item not found')
      return item
   }

   async function assertCategory(me: MembershipType, id: string | null | undefined) {
      if (!id) return
      if (!(await ShoppingCategory.exists({ _id: id, householdId: me.householdId }))) throw new BadRequestError('Pick a category of this household.')
   }

   /** Category for a name: what it had last time, else the catalog's default (if that category still exists). */
   async function defaultCategory(me: MembershipType, key: string): Promise<Types.ObjectId | null> {
      const remembered = await ItemMemory.findOne({ householdId: me.householdId, nameKey: key }).select('categoryId').lean()
      if (remembered) return remembered.categoryId ?? null
      const entry = GROCERY_CATALOG_DE.find((c) => nameKey(c.name) === key)
      if (!entry) return null
      const category = await ShoppingCategory.findOne({ householdId: me.householdId, key: entry.category }).select('_id').lean()
      return category?._id ?? null
   }

   async function remember(me: MembershipType, item: { name: string; nameKey: string; categoryId?: Types.ObjectId | string | null; unit?: string | null; quantity?: number | null }, used: boolean) {
      await ItemMemory.updateOne(
         { householdId: me.householdId, nameKey: item.nameKey },
         {
            $set: { name: item.name, categoryId: item.categoryId ?? null, unit: item.unit ?? null, quantity: item.quantity ?? null, lastUsedAt: new Date() },
            ...(used ? { $inc: { uses: 1 } } : {}),
         },
         { upsert: true },
      )
   }

   /** Adds one item, merging it into an open (or basket) item with the same name when the units fit. */
   async function add(me: MembershipType, listId: Types.ObjectId, input: ItemInput) {
      await assertCategory(me, input.categoryId)
      const key = nameKey(input.name)
      const categoryId = input.categoryId === undefined ? await defaultCategory(me, key) : input.categoryId
      const existing = input.checked ? [] : await ShoppingItem.find({ listId, nameKey: key }).lean()
      const decision = mergeInto(
         existing.map((i) => ({ id: i._id.toString(), nameKey: i.nameKey, quantity: i.quantity ?? null, unit: (i.unit ?? null) as UnitId | null, checked: i.checked })),
         { nameKey: key, quantity: input.quantity, unit: input.unit },
      )
      let item
      if (decision.kind === 'update') {
         item = await ShoppingItem.findOneAndUpdate(
            { _id: decision.id },
            {
               $set: {
                  quantity: decision.quantity,
                  unit: decision.unit,
                  ...(input.note ? { note: input.note } : {}),
                  ...(decision.uncheck ? { checked: false, checkedAt: null, checkedBy: null } : {}),
               },
               $addToSet: { fromRecipeIds: { $each: input.fromRecipeIds } },
            },
            { returnDocument: 'after' },
         )
      }
      item ??= await ShoppingItem.create({
         householdId: me.householdId,
         listId,
         name: input.name,
         nameKey: key,
         quantity: input.quantity,
         unit: input.unit,
         note: input.note,
         categoryId,
         addedBy: me._id,
         fromRecipeIds: input.fromRecipeIds,
         ...(input.checked ? { checked: true, checkedAt: new Date(), checkedBy: me._id } : {}),
      })
      await remember(me, { name: input.name, nameKey: key, categoryId, unit: input.unit, quantity: input.quantity }, !input.checked)
      return item
   }

   return {
      async lists(me: MembershipType) {
         await ensureSeeded(me)
         const lists = await ShoppingList.find({ householdId: me.householdId }).sort({ position: 1, createdAt: 1 }).lean()
         const counts = await ShoppingItem.aggregate<{ _id: Types.ObjectId; n: number }>([
            { $match: { householdId: me.householdId, checked: false } },
            { $group: { _id: '$listId', n: { $sum: 1 } } },
         ])
         const open = new Map(counts.map((c) => [c._id.toString(), c.n]))
         return lists.map((l) => listView(l, open.get(l._id.toString()) ?? 0))
      },

      async createList(me: MembershipType, name: string) {
         await ensureSeeded(me)
         const last = await ShoppingList.findOne({ householdId: me.householdId }).sort({ position: -1 }).select('position').lean()
         const list = await ShoppingList.create({ householdId: me.householdId, name, position: (last?.position ?? -1) + 1, createdBy: me._id })
         changed(me)
         return listView(list, 0)
      },

      async updateList(me: MembershipType, id: string, input: { name?: string | undefined; position?: number | undefined }) {
         const list = await findList(me, id)
         if (input.name !== undefined) list.name = input.name
         if (input.position !== undefined) list.position = input.position
         await list.save()
         changed(me)
         return listView(list, await ShoppingItem.countDocuments({ listId: list._id, checked: false }))
      },

      async removeList(me: MembershipType, id: string) {
         const list = await findList(me, id)
         if (!canDeleteShared(me.role, list.createdBy.equals(me._id))) {
            throw new ForbiddenError('Only the person who made this list or an admin can delete it.')
         }
         await ShoppingItem.deleteMany({ listId: list._id })
         await list.deleteOne()
         changed(me)
      },

      async items(me: MembershipType, listId: string) {
         const list = await findList(me, listId)
         const items = await ShoppingItem.find({ listId: list._id }).sort({ createdAt: 1 }).lean()
         return items.map(itemView)
      },

      async addItem(me: MembershipType, listId: string, input: ItemInput) {
         const list = await findList(me, listId)
         const item = await add(me, list._id, input)
         changed(me)
         return itemView(item)
      },

      /** Several at once (recipes, meal plan, undo); each merges like a single add. */
      async addItems(me: MembershipType, listId: string, inputs: ItemInput[]) {
         const list = await findList(me, listId)
         const items = []
         for (const input of inputs) items.push(await add(me, list._id, input))
         changed(me)
         return items.map(itemView)
      },

      async updateItem(me: MembershipType, listId: string, itemId: string, input: ItemUpdate) {
         const item = await findItem(me, listId, itemId)
         await assertCategory(me, input.categoryId)
         if (input.name !== undefined) {
            item.name = input.name
            item.nameKey = nameKey(input.name)
         }
         if (input.quantity !== undefined) item.quantity = input.quantity
         if (input.unit !== undefined) item.unit = input.unit
         if (input.note !== undefined) item.note = input.note
         if (input.categoryId !== undefined) item.set('categoryId', input.categoryId)
         if (input.checked !== undefined && input.checked !== item.checked) {
            item.set({ checked: input.checked, checkedAt: input.checked ? new Date() : null, checkedBy: input.checked ? me._id : null })
         }
         await item.save()
         // Edits teach the memory (a corrected category sticks for next time).
         if (input.name !== undefined || input.categoryId !== undefined || input.unit !== undefined || input.quantity !== undefined) {
            await remember(me, item, false)
         }
         changed(me)
         return itemView(item)
      },

      async removeItem(me: MembershipType, listId: string, itemId: string) {
         const item = await findItem(me, listId, itemId)
         await item.deleteOne()
         changed(me)
      },

      /** Empties the basket; returns what was removed (so the client can undo). */
      async clearChecked(me: MembershipType, listId: string) {
         const list = await findList(me, listId)
         const removed = await ShoppingItem.find({ listId: list._id, checked: true }).lean()
         await ShoppingItem.deleteMany({ _id: { $in: removed.map((i) => i._id) } })
         if (removed.length) changed(me)
         return removed.map(itemView)
      },

      async suggestions(me: MembershipType, query: string) {
         await ensureSeeded(me)
         const memory = await ItemMemory.find({ householdId: me.householdId }).sort({ uses: -1 }).limit(MEMORY_SCAN).lean()
         const remembered: Remembered[] = memory.map((m) => ({
            name: m.name,
            nameKey: m.nameKey,
            categoryId: m.categoryId?.toString() ?? null,
            unit: (m.unit ?? null) as UnitId | null,
            quantity: m.quantity ?? null,
            uses: m.uses,
            lastUsedAt: m.lastUsedAt.getTime(),
         }))
         const categories = await ShoppingCategory.find({ householdId: me.householdId, key: { $ne: null } }).select('key').lean()
         const byKey = new Map(categories.map((c) => [c.key, c._id.toString()]))
         return suggest(query, remembered, GROCERY_CATALOG_DE).map(({ categoryKey, ...s }) => ({
            ...s,
            categoryId: s.categoryId ?? (categoryKey ? (byKey.get(categoryKey) ?? null) : null),
         }))
      },

      async categories(me: MembershipType) {
         await ensureSeeded(me)
         return (await ShoppingCategory.find({ householdId: me.householdId }).sort({ position: 1, createdAt: 1 }).lean()).map(categoryView)
      },

      async createCategory(me: MembershipType, input: { name: string; icon: CategoryIcon }) {
         await ensureSeeded(me)
         const last = await ShoppingCategory.findOne({ householdId: me.householdId }).sort({ position: -1 }).select('position').lean()
         const category = await ShoppingCategory.create({ householdId: me.householdId, ...input, position: (last?.position ?? -1) + 1 })
         changed(me)
         return categoryView(category)
      },

      async updateCategory(me: MembershipType, id: string, input: { name?: string | undefined; icon?: CategoryIcon | undefined }) {
         const category = isValidObjectId(id) ? await ShoppingCategory.findOne({ _id: id, householdId: me.householdId }) : null
         if (!category) throw new NotFoundError('Category not found')
         if (input.name !== undefined) category.name = input.name
         if (input.icon !== undefined) category.set('icon', input.icon)
         await category.save()
         changed(me)
         return categoryView(category)
      },

      /** Items and remembered names in it become uncategorized. */
      async removeCategory(me: MembershipType, id: string) {
         const category = isValidObjectId(id) ? await ShoppingCategory.findOne({ _id: id, householdId: me.householdId }) : null
         if (!category) throw new NotFoundError('Category not found')
         await ShoppingItem.updateMany({ householdId: me.householdId, categoryId: category._id }, { $set: { categoryId: null } })
         await ItemMemory.updateMany({ householdId: me.householdId, categoryId: category._id }, { $set: { categoryId: null } })
         await category.deleteOne()
         changed(me)
      },

      /** New order: every category of the household exactly once. */
      async orderCategories(me: MembershipType, ids: string[]) {
         const all = await ShoppingCategory.find({ householdId: me.householdId }).select('_id').lean()
         const known = new Set(all.map((c) => c._id.toString()))
         if (ids.length !== known.size || !ids.every((id) => known.has(id))) throw new BadRequestError('List every category exactly once.')
         await ShoppingCategory.bulkWrite(ids.map((id, position) => ({ updateOne: { filter: { _id: id }, update: { $set: { position } } } })))
         changed(me)
         return (await ShoppingCategory.find({ householdId: me.householdId }).sort({ position: 1 }).lean()).map(categoryView)
      },
   }
}

export type ShoppingService = ReturnType<typeof createShoppingService>
