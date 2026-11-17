/**
 * Packing lists (plan: docs/plans/holidays-packing-pwa.md, phase 2). Pure rules:
 * building a list from a template, travellers and trip length, progress per
 * person, turning a list back into a template, and shopping lines.
 */

/** Fixed sections (app choice): enough for trips, and each gets an icon. */
export const PACKING_SECTIONS = ['documents', 'clothes', 'toiletries', 'health', 'electronics', 'gear', 'kids', 'food', 'other'] as const
export type PackingSection = (typeof PACKING_SECTIONS)[number]

/** Amounts are whole things (3 pairs of socks); limits are app choices. */
export const MAX_AMOUNT = 99
export const MAX_TRIP_DAYS = 365

/**
 * How many to pack (user request 2026-11-16): none (an ID card), a fixed amount
 * for the trip (2 swimsuits), or an amount per day (1 pair of socks a day),
 * optionally capped (at most 7, for longer trips with laundry).
 */
export type TemplateItem = {
   text: string
   section: PackingSection
   perPerson: boolean
   /** null = no amount. */
   amount: number | null
   perDay: boolean
   /** Cap for per-day amounts; null = none. */
   maxAmount: number | null
}
export type ListItem = { text: string; section: PackingSection; memberId: string | null; quantity: number | null }

/**
 * The amount for a trip of `days` days. A per-day amount without a known trip
 * length has no amount (the list shows none; it can be set by hand).
 */
export function amountFor(item: Pick<TemplateItem, 'amount' | 'perDay' | 'maxAmount'>, days: number | null): number | null {
   if (item.amount === null) return null
   if (!item.perDay) return item.amount
   if (days === null) return null
   const total = Math.ceil(item.amount * days)
   return Math.min(total, item.maxAmount ?? MAX_AMOUNT, MAX_AMOUNT)
}

/**
 * A template's items for these travellers and trip length: per-person items once
 * for each traveller (in their order), shared items once. Without travellers,
 * per-person items are added once as shared items.
 */
export function itemsFromTemplate(items: readonly TemplateItem[], travellerIds: readonly string[], days: number | null): ListItem[] {
   const result: ListItem[] = []
   for (const item of items) {
      const base = { text: item.text, section: item.section, quantity: amountFor(item, days) }
      if (item.perPerson && travellerIds.length) {
         for (const memberId of travellerIds) result.push({ ...base, memberId })
      } else {
         result.push({ ...base, memberId: null })
      }
   }
   return result
}

/** Days of a trip from all-day dates [start, end) as `YYYY-MM-DD` (10–14 Dec = 4 days); null if not a range. */
export function tripDays(start: string, endExclusive: string): number | null {
   const days = Math.round((Date.parse(`${endExclusive}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)
   return Number.isFinite(days) && days >= 1 ? Math.min(days, MAX_TRIP_DAYS) : null
}

export type Progress = { done: number; total: number }

/** Packed / all, overall and per person (`null` = shared items). */
export function progress(items: readonly { memberId: string | null; checked: boolean }[]) {
   const overall: Progress = { done: 0, total: 0 }
   const byMember = new Map<string | null, Progress>()
   for (const item of items) {
      const p = byMember.get(item.memberId) ?? { done: 0, total: 0 }
      p.total++
      overall.total++
      if (item.checked) {
         p.done++
         overall.done++
      }
      byMember.set(item.memberId, p)
   }
   return { overall, byMember }
}

const key = (text: string, section: string) => `${section}\u0000${text.trim().toLocaleLowerCase('de')}`

/**
 * A list as a template: each text once per section (first spelling wins);
 * it's per person if the list had it for at least one person. The amount is
 * the largest one on the list, as a fixed amount (the list doesn't know per day).
 */
export function templateFromList(items: readonly ListItem[]): TemplateItem[] {
   const byKey = new Map<string, TemplateItem>()
   for (const item of items) {
      const k = key(item.text, item.section)
      const existing = byKey.get(k)
      if (existing) {
         existing.perPerson ||= item.memberId !== null
         if (item.quantity !== null) existing.amount = Math.max(existing.amount ?? 0, item.quantity)
      } else {
         byKey.set(k, { text: item.text.trim(), section: item.section, perPerson: item.memberId !== null, amount: item.quantity, perDay: false, maxAmount: null })
      }
   }
   return [...byKey.values()]
}

/**
 * A traveller added to an existing list (user request 2026-11-16) gets the list's
 * personal items: each text that someone has for themselves, once, with the largest
 * amount anyone has. Shared items stay shared.
 */
export function itemsForNewTraveller(items: readonly ListItem[], memberId: string): ListItem[] {
   return templateFromList(items.filter((i) => i.memberId !== null)).map((t) => ({ text: t.text, section: t.section, memberId, quantity: t.amount }))
}

/**
 * Unpacked items for the shopping list: one line per text with the amounts added
 * up; an item without an amount counts as one (2 people × toothbrush = 2).
 * Order of first appearance.
 */
export function shoppingLines(items: readonly { text: string; checked: boolean; quantity: number | null }[]): { name: string; count: number }[] {
   const lines = new Map<string, { name: string; count: number }>()
   for (const item of items) {
      if (item.checked) continue
      const k = item.text.trim().toLocaleLowerCase('de')
      const n = item.quantity ?? 1
      const line = lines.get(k)
      if (line) line.count += n
      else lines.set(k, { name: item.text.trim(), count: n })
   }
   return [...lines.values()]
}
