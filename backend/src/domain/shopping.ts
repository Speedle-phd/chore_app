import { addAmounts, type Amount, type UnitId } from './units'

/**
 * Shopping list rules. Pure: data in, decision out.
 * App choices (see docs/plans/shopping-recipes.md): items are matched by a
 * normalized name; adding something already open on the list adds the amounts
 * when the units fit; adding something already in the basket takes it out again
 * with the new amount; suggestions prefer what the household bought before.
 */

/** Comparison key for item names: case, spacing and ß/ss don't matter. */
export function nameKey(name: string): string {
   return name.normalize('NFKC').trim().toLowerCase().replace(/ß/g, 'ss').replace(/\s+/g, ' ')
}

export type ListItem = Amount & { id: string; nameKey: string; checked: boolean }
export type AddedItem = Amount & { nameKey: string }

export type MergeDecision =
   | { kind: 'update'; id: string; quantity: number | null; unit: UnitId | null; uncheck: boolean }
   | { kind: 'create' }

/** Where an added item goes: into an open item with the same name, back from the basket, or a new line. */
export function mergeInto(items: ListItem[], added: AddedItem): MergeDecision {
   for (const item of items) {
      if (item.checked || item.nameKey !== added.nameKey) continue
      const sum = addAmounts(item, added)
      if (sum) return { kind: 'update', id: item.id, ...sum, uncheck: false }
   }
   const inBasket = items.find((i) => i.checked && i.nameKey === added.nameKey)
   if (inBasket) return { kind: 'update', id: inBasket.id, quantity: added.quantity, unit: added.unit, uncheck: true }
   return { kind: 'create' }
}

export type Remembered = { name: string; nameKey: string; categoryId: string | null; unit: UnitId | null; quantity: number | null; uses: number; lastUsedAt: number }
export type CatalogEntry = { name: string; category: string; unit: UnitId | null }
export type Suggestion = {
   name: string
   unit: UnitId | null
   quantity: number | null
   /** History: the household's category id; catalog: a default category key. */
   categoryId: string | null
   categoryKey: string | null
   source: 'history' | 'catalog'
}

/** Most suggestions shown at once. App choice. */
export const MAX_SUGGESTIONS = 8

/**
 * Suggestions for what's typed: the household's own items first (prefix before
 * infix, then most used, then most recent), then catalog entries (prefix before
 * infix, alphabetical). Nothing typed: the most used items ("buy again").
 */
export function suggest(query: string, memory: Remembered[], catalog: readonly CatalogEntry[], limit = MAX_SUGGESTIONS): Suggestion[] {
   const q = nameKey(query)
   const rank = (key: string) => (key.startsWith(q) ? 0 : key.split(' ').some((w) => w.startsWith(q)) ? 1 : key.includes(q) ? 2 : -1)
   const fromHistory = memory
      .map((m) => ({ m, r: q ? rank(m.nameKey) : 0 }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || b.m.uses - a.m.uses || b.m.lastUsedAt - a.m.lastUsedAt)
      .map(({ m }): Suggestion => ({ name: m.name, unit: m.unit, quantity: m.quantity, categoryId: m.categoryId, categoryKey: null, source: 'history' }))
   if (!q) return fromHistory.slice(0, limit)
   const known = new Set(memory.map((m) => m.nameKey))
   const fromCatalog = catalog
      .map((c) => ({ c, key: nameKey(c.name) }))
      .filter(({ key }) => !known.has(key))
      .map((x) => ({ ...x, r: rank(x.key) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name, 'de'))
      .map(({ c }): Suggestion => ({ name: c.name, unit: c.unit, quantity: null, categoryId: null, categoryKey: c.category, source: 'catalog' }))
   return [...fromHistory, ...fromCatalog].slice(0, limit)
}
