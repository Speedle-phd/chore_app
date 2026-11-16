import type { Types } from 'mongoose'
import type { UnitId } from '../domain/units'

type Id = Types.ObjectId

export type ShoppingListView = { id: string; name: string; position: number; openCount: number; createdBy: string }

export const listView = (l: { _id: Id; name: string; position: number; createdBy: Id }, openCount: number): ShoppingListView => ({
   id: l._id.toString(),
   name: l.name,
   position: l.position,
   openCount,
   createdBy: l.createdBy.toString(),
})

export type ShoppingItemView = {
   id: string
   listId: string
   name: string
   quantity: number | null
   unit: UnitId | null
   note: string
   categoryId: string | null
   checked: boolean
   checkedAt: string | null
   checkedBy: string | null
   addedBy: string
   fromRecipeIds: string[]
   createdAt: string
}

type StoredItem = {
   _id: Id
   listId: Id
   name: string
   quantity?: number | null
   unit?: string | null
   note?: string | null
   categoryId?: Id | null
   checked: boolean
   checkedAt?: Date | null
   checkedBy?: Id | null
   addedBy: Id
   fromRecipeIds?: Id[] | null
   createdAt: Date
}

export const itemView = (i: StoredItem): ShoppingItemView => ({
   id: i._id.toString(),
   listId: i.listId.toString(),
   name: i.name,
   quantity: i.quantity ?? null,
   unit: (i.unit ?? null) as UnitId | null,
   note: i.note ?? '',
   categoryId: i.categoryId?.toString() ?? null,
   checked: i.checked,
   checkedAt: i.checkedAt?.toISOString() ?? null,
   checkedBy: i.checkedBy?.toString() ?? null,
   addedBy: i.addedBy.toString(),
   fromRecipeIds: (i.fromRecipeIds ?? []).map(String),
   createdAt: i.createdAt.toISOString(),
})

export type ShoppingCategoryView = { id: string; key: string | null; name: string; icon: string; position: number }

export const categoryView = (c: { _id: Id; key?: string | null; name: string; icon?: string | null; position: number }): ShoppingCategoryView => ({
   id: c._id.toString(),
   key: c.key ?? null,
   name: c.name,
   icon: c.icon ?? 'package',
   position: c.position,
})
