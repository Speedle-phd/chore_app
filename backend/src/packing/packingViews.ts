import type { Types } from 'mongoose'
import { progress, type PackingSection, type TemplateItem } from '../domain/packing'

type Id = Types.ObjectId

type StoredTemplateItem = {
   text: string
   section: string
   perPerson?: boolean | null
   amount?: number | null
   perDay?: boolean | null
   maxAmount?: number | null
}
type StoredTemplate = { _id: Id; name: string; items: StoredTemplateItem[]; createdBy: Id; createdAt: Date }

/** Stored template item → domain/API shape (fields added later default to "no amount"). */
export const templateItemView = (i: StoredTemplateItem): TemplateItem => {
   const amount = i.amount ?? null
   const perDay = Boolean(i.perDay) && amount !== null
   return {
      text: i.text,
      section: i.section as PackingSection,
      perPerson: Boolean(i.perPerson),
      amount,
      perDay,
      maxAmount: perDay ? (i.maxAmount ?? null) : null,
   }
}

export const templateView = (t: StoredTemplate) => ({
   id: t._id.toString(),
   name: t.name,
   items: t.items.map(templateItemView),
   createdBy: t.createdBy.toString(),
   createdAt: t.createdAt.toISOString(),
})

type StoredItem = {
   _id: Id
   text: string
   section: string
   memberId?: Id | null
   quantity?: number | null
   checked?: boolean | null
   checkedBy?: Id | null
   checkedAt?: Date | null
}
type StoredList = {
   _id: Id
   name: string
   vacationId?: Id | null
   travellerIds: Id[]
   days?: number | null
   items: StoredItem[]
   createdBy: Id
   archivedAt?: Date | null
   createdAt: Date
}

const itemView = (i: StoredItem) => ({
   id: i._id.toString(),
   text: i.text,
   section: i.section as PackingSection,
   memberId: i.memberId?.toString() ?? null,
   quantity: i.quantity ?? null,
   checked: Boolean(i.checked),
   checkedBy: i.checkedBy?.toString() ?? null,
   checkedAt: i.checkedAt?.toISOString() ?? null,
})

/** Overview (no items): name, link, travellers and how far packing is. */
export function listSummaryView(l: StoredList) {
   const items = l.items.map(itemView)
   return {
      id: l._id.toString(),
      name: l.name,
      vacationId: l.vacationId?.toString() ?? null,
      travellerIds: l.travellerIds.map(String),
      days: l.days ?? null,
      progress: progress(items).overall,
      createdBy: l.createdBy.toString(),
      archivedAt: l.archivedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
   }
}

export const listView = (l: StoredList) => ({ ...listSummaryView(l), items: l.items.map(itemView) })
