import type { ShoppingCategory, ShoppingItem } from './shoppingApi'

/**
 * Units offered (server: backend/src/domain/units.ts; same ids and order). German labels,
 * like the ingredients and the grocery catalog (user decision 2026-11-15); `many` = plural.
 */
export const UNITS = [
   { id: 'pcs', label: 'Stk.', many: 'Stk.' },
   { id: 'g', label: 'g', many: 'g' },
   { id: 'kg', label: 'kg', many: 'kg' },
   { id: 'ml', label: 'ml', many: 'ml' },
   { id: 'l', label: 'l', many: 'l' },
   { id: 'tsp', label: 'TL', many: 'TL' },
   { id: 'tbsp', label: 'EL', many: 'EL' },
   { id: 'pinch', label: 'Prise', many: 'Prisen' },
   { id: 'pack', label: 'Pck.', many: 'Pck.' },
   { id: 'can', label: 'Dose', many: 'Dosen' },
   { id: 'bottle', label: 'Flasche', many: 'Flaschen' },
   { id: 'tub', label: 'Becher', many: 'Becher' },
   { id: 'bunch', label: 'Bund', many: 'Bund' },
   { id: 'clove', label: 'Zehe', many: 'Zehen' },
   { id: 'slice', label: 'Scheibe', many: 'Scheiben' },
   { id: 'cup', label: 'Tasse', many: 'Tassen' },
] as const
export type UnitId = (typeof UNITS)[number]['id']

/** "1,5 l", "2 Dosen", "2 ×" (count without unit), "Bund" (no amount), "" (nothing); numbers in the viewer's locale. */
export function formatAmount(quantity: number | null, unit: UnitId | null, locale?: string): string {
   const u = UNITS.find((x) => x.id === unit)
   if (quantity === null) return u && unit !== 'pcs' ? u.label : ''
   const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(quantity)
   if (!u) return `${n} ×`
   return `${n} ${quantity > 1 ? u.many : u.label}`
}

/** Reads "1,5" or "1.5" or "½" as a number; empty → null; nonsense → undefined. */
export function parseQuantity(text: string): number | null | undefined {
   const t = text.trim().replace(',', '.')
   if (!t) return null
   const fractions: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
   if (t in fractions) return fractions[t]
   const frac = /^(\d+)\/(\d+)$/.exec(t)
   if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : undefined
   const n = Number(t)
   return Number.isFinite(n) && n > 0 ? n : undefined
}

export type Section = { category: ShoppingCategory | null; items: ShoppingItem[] }

/** Open items grouped by category in the household's order (uncategorized last); items by name. */
export function groupByCategory(items: ShoppingItem[], categories: ShoppingCategory[]): Section[] {
   const open = items.filter((i) => !i.checked)
   const byName = (a: ShoppingItem, b: ShoppingItem) => a.name.localeCompare(b.name)
   const known = new Set(categories.map((c) => c.id))
   const sections: Section[] = [...categories]
      .sort((a, b) => a.position - b.position)
      .map((category) => ({ category, items: open.filter((i) => i.categoryId === category.id).sort(byName) }))
      .filter((s) => s.items.length)
   const rest = open.filter((i) => !i.categoryId || !known.has(i.categoryId)).sort(byName)
   return rest.length ? [...sections, { category: null, items: rest }] : sections
}
