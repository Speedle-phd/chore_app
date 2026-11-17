import { isValidObjectId, Types } from 'mongoose'
import { itemsForNewTraveller, itemsFromTemplate, shoppingLines, templateFromList, type ListItem, type PackingSection } from '../domain/packing'
import { ORIGINAL_STARTER_KEYS, STARTER_TEMPLATES } from '../domain/packingStarters'
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors'
import { canDeleteShared } from '../households/permissions'
import { CalendarItem } from '../models/calendarItemModel'
import { Household } from '../models/householdModel'
import { Membership, type MembershipType } from '../models/membershipModel'
import { MAX_LIST_ITEMS, PackingList, PackingTemplate } from '../models/packingModels'
import { itemInputSchema as shoppingItemSchema } from '../shopping/shoppingSchemas'
import type { ShoppingService } from '../shopping/shoppingService'
import { realtime } from '../socket/realtime'
import type { ItemInput, ItemUpdate, ListInput, TemplateInput } from './packingSchemas'
import { listSummaryView, listView, templateItemView, templateView } from './packingViews'

const oid = (id: string) => new Types.ObjectId(id)

export function createPackingService({ shopping }: { shopping: ShoppingService }) {
   const changed = (me: MembershipType) => realtime.householdChanged(me.householdId, 'packing')

   /**
    * Starter templates: each key once per household, claimed atomically, so starters
    * added later reach existing households and deleted ones stay gone.
    */
   async function ensureSeeded(me: MembershipType) {
      // Households seeded before keys existed already have the first three.
      await Household.updateOne(
         { _id: me.householdId, packingSeededAt: { $ne: null }, packingStarters: { $size: 0 } },
         { $set: { packingStarters: [...ORIGINAL_STARTER_KEYS] } },
      )
      const household = await Household.findById(me.householdId).select('packingStarters').lean()
      const missing = STARTER_TEMPLATES.filter((t) => !(household?.packingStarters ?? []).includes(t.key))
      if (!missing.length) return
      const owner = await Membership.findOne({ householdId: me.householdId, role: 'owner' }).sort({ createdAt: 1 }).select('_id').lean()
      for (const starter of missing) {
         const claim = await Household.updateOne(
            { _id: me.householdId, packingStarters: { $ne: starter.key } },
            { $addToSet: { packingStarters: starter.key }, $set: { packingSeededAt: new Date() } },
         )
         if (claim.modifiedCount !== 1) continue
         await PackingTemplate.create({ householdId: me.householdId, name: starter.name, items: [...starter.items], createdBy: owner?._id ?? me._id })
      }
   }

   /** Everyone named must belong to this household. */
   async function assertMembers(me: MembershipType, ids: readonly (string | null)[]) {
      const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
      if (!wanted.length) return
      const found = await Membership.countDocuments({ _id: { $in: wanted }, householdId: me.householdId })
      if (found !== wanted.length) throw new BadRequestError('Pick people of this household.')
   }

   async function findTemplate(me: MembershipType, id: string) {
      const template = isValidObjectId(id) ? await PackingTemplate.findOne({ _id: id, householdId: me.householdId }) : null
      if (!template) throw new NotFoundError('Template not found')
      return template
   }

   async function findList(me: MembershipType, id: string) {
      const list = isValidObjectId(id) ? await PackingList.findOne({ _id: id, householdId: me.householdId }) : null
      if (!list) throw new NotFoundError('Packing list not found')
      return list
   }

   /** The list after an atomic item change, or 404 when the list or item is gone. */
   async function afterItemChange(me: MembershipType, listId: string, matched: number, what = 'Item') {
      if (!matched) {
         await findList(me, listId) // 404 for a missing list first
         throw new NotFoundError(`${what} not found`)
      }
      changed(me)
      return listView(await findList(me, listId))
   }

   /**
    * Travellers in hindsight (user request 2026-11-16): new ones get the list’s
    * personal items (if wanted); removed ones take their items with them.
    */
   async function changeTravellers(me: MembershipType, list: Awaited<ReturnType<typeof findList>>, ids: string[], copyItems: boolean) {
      await assertMembers(me, ids)
      const before = list.travellerIds.map(String)
      const added = ids.filter((id) => !before.includes(id))
      const removed = before.filter((id) => !ids.includes(id))
      const current: ListItem[] = list.items.map((i) => ({
         text: i.text,
         section: i.section as PackingSection,
         memberId: i.memberId?.toString() ?? null,
         quantity: i.quantity ?? null,
      }))
      const kept = list.items.filter((i) => !(i.memberId && removed.includes(i.memberId.toString())))
      const extra = copyItems ? added.flatMap((id) => itemsForNewTraveller(current.filter((i) => !removed.includes(i.memberId ?? '')), id)) : []
      if (kept.length + extra.length > MAX_LIST_ITEMS) throw new BadRequestError(`A packing list holds at most ${MAX_LIST_ITEMS} items.`)
      list.set('items', [...kept, ...extra])
      list.set('travellerIds', ids)
   }

   const assertListId = (id: string, itemId?: string) => {
      if (!isValidObjectId(id) || (itemId !== undefined && !isValidObjectId(itemId))) throw new NotFoundError('Item not found')
   }

   return {
      async templates(me: MembershipType) {
         await ensureSeeded(me)
         const templates = await PackingTemplate.find({ householdId: me.householdId }).sort({ name: 1 }).lean()
         return templates.map(templateView)
      },

      async createTemplate(me: MembershipType, input: TemplateInput) {
         await ensureSeeded(me)
         const template = await PackingTemplate.create({ householdId: me.householdId, ...input, createdBy: me._id })
         changed(me)
         return templateView(template)
      },

      async updateTemplate(me: MembershipType, id: string, input: { name?: string | undefined; items?: TemplateInput['items'] | undefined }) {
         const template = await findTemplate(me, id)
         if (input.name !== undefined) template.name = input.name
         if (input.items !== undefined) template.set('items', input.items)
         await template.save()
         changed(me)
         return templateView(template)
      },

      async removeTemplate(me: MembershipType, id: string) {
         const template = await findTemplate(me, id)
         if (!canDeleteShared(me.role, template.createdBy.equals(me._id))) {
            throw new ForbiddenError('Only the person who made this template or an admin can delete it.')
         }
         await template.deleteOne()
         changed(me)
      },

      async lists(me: MembershipType) {
         const lists = await PackingList.find({ householdId: me.householdId }).sort({ createdAt: -1 }).lean()
         return lists.map(listSummaryView)
      },

      async list(me: MembershipType, id: string) {
         return listView(await findList(me, id))
      },

      async createList(me: MembershipType, input: ListInput) {
         await assertMembers(me, input.travellerIds)
         if (input.vacationId && !(await CalendarItem.exists({ _id: input.vacationId, householdId: me.householdId, kind: 'vacation' }))) {
            throw new BadRequestError('Pick a vacation of this household.')
         }
         const template = input.templateId ? await findTemplate(me, input.templateId) : null
         const items = template ? itemsFromTemplate(template.items.map(templateItemView), input.travellerIds, input.days) : []
         const list = await PackingList.create({
            householdId: me.householdId,
            name: input.name,
            vacationId: input.vacationId,
            travellerIds: input.travellerIds,
            days: input.days,
            items: items.slice(0, MAX_LIST_ITEMS),
            createdBy: me._id,
         })
         changed(me)
         return listView(list)
      },

      /** Name, archive state, or trip length (stored only: amounts already on the list stay as they are). */
      async updateList(
         me: MembershipType,
         id: string,
         input: {
            name?: string | undefined
            archived?: boolean | undefined
            days?: number | null | undefined
            travellerIds?: string[] | undefined
            copyItems?: boolean | undefined
         },
      ) {
         const list = await findList(me, id)
         if (input.travellerIds !== undefined) await changeTravellers(me, list, input.travellerIds, input.copyItems ?? true)
         if (input.name !== undefined) list.name = input.name
         if (input.days !== undefined) list.days = input.days
         if (input.archived !== undefined) list.archivedAt = input.archived ? (list.archivedAt ?? new Date()) : null
         await list.save()
         changed(me)
         return listView(list)
      },

      async removeList(me: MembershipType, id: string) {
         const list = await findList(me, id)
         if (!canDeleteShared(me.role, list.createdBy.equals(me._id))) {
            throw new ForbiddenError('Only the person who made this list or an admin can delete it.')
         }
         await list.deleteOne()
         changed(me)
      },

      async addItem(me: MembershipType, listId: string, input: ItemInput) {
         assertListId(listId)
         await assertMembers(me, [input.memberId])
         const result = await PackingList.updateOne(
            // Only while there is room (the item at index MAX-1 doesn't exist yet).
            { _id: listId, householdId: me.householdId, [`items.${MAX_LIST_ITEMS - 1}`]: { $exists: false } },
            { $push: { items: { text: input.text, section: input.section, memberId: input.memberId, quantity: input.quantity } } },
         )
         if (!result.matchedCount) {
            await findList(me, listId)
            throw new BadRequestError(`A packing list holds at most ${MAX_LIST_ITEMS} items.`)
         }
         changed(me)
         return listView(await findList(me, listId))
      },

      async updateItem(me: MembershipType, listId: string, itemId: string, input: ItemUpdate) {
         assertListId(listId, itemId)
         if (input.memberId !== undefined) await assertMembers(me, [input.memberId])
         const set: Record<string, unknown> = {}
         if (input.text !== undefined) set['items.$.text'] = input.text
         if (input.section !== undefined) set['items.$.section'] = input.section
         if (input.memberId !== undefined) set['items.$.memberId'] = input.memberId
         if (input.quantity !== undefined) set['items.$.quantity'] = input.quantity
         if (input.checked !== undefined) {
            set['items.$.checked'] = input.checked
            set['items.$.checkedBy'] = input.checked ? me._id : null
            set['items.$.checkedAt'] = input.checked ? new Date() : null
         }
         const result = await PackingList.updateOne({ _id: listId, householdId: me.householdId, 'items._id': itemId }, { $set: set })
         return afterItemChange(me, listId, result.matchedCount)
      },

      async removeItem(me: MembershipType, listId: string, itemId: string) {
         assertListId(listId, itemId)
         const result = await PackingList.updateOne(
            { _id: listId, householdId: me.householdId, 'items._id': itemId },
            { $pull: { items: { _id: oid(itemId) } } },
         )
         return afterItemChange(me, listId, result.matchedCount)
      },

      /** Unpacked items onto a shopping list (merged there like any other addition). */
      async toShopping(me: MembershipType, listId: string, shoppingListId: string) {
         const list = await findList(me, listId)
         const lines = shoppingLines(list.items.map((i) => ({ text: i.text, checked: i.checked, quantity: i.quantity ?? null })))
         if (!lines.length) return { added: 0 }
         const inputs = lines.map((l) =>
            shoppingItemSchema.parse({ name: l.name, quantity: l.count > 1 ? l.count : null, unit: l.count > 1 ? 'pcs' : null, note: `Packing: ${list.name}`.slice(0, 200) }),
         )
         const added = await shopping.addItems(me, shoppingListId, inputs)
         return { added: added.length }
      },

      async saveAsTemplate(me: MembershipType, listId: string, name: string) {
         const list = await findList(me, listId)
         const items = templateFromList(
            list.items.map((i) => ({ text: i.text, section: i.section as PackingSection, memberId: i.memberId?.toString() ?? null, quantity: i.quantity ?? null })),
         )
         await ensureSeeded(me)
         const template = await PackingTemplate.create({ householdId: me.householdId, name, items, createdBy: me._id })
         changed(me)
         return templateView(template)
      },
   }
}

export type PackingService = ReturnType<typeof createPackingService>
