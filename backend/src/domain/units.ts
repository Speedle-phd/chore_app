/**
 * Units for shopping items and recipe ingredients. Data table + pure helpers.
 * Labels are German, like the ingredients (the client shows its own copy, with plurals).
 * App choices: metric only; spoons are their own dimension (you don't buy teaspoons,
 * but recipes add them up); everything else merges only with itself.
 */

type Dimension = 'mass' | 'volume' | 'spoon' | 'count' | 'other'

/** `factor`: size in the dimension's base unit (g, ml, tsp); used to add and convert. */
export const UNITS = [
   { id: 'pcs', label: 'Stk.', dimension: 'count', factor: 1, aliases: ['stk', 'stück', 'stck', 'st', 'pc', 'pcs', 'piece', 'pieces', 'x'] },
   { id: 'g', label: 'g', dimension: 'mass', factor: 1, aliases: ['g', 'gr', 'gramm', 'gram', 'grams'] },
   { id: 'kg', label: 'kg', dimension: 'mass', factor: 1000, aliases: ['kg', 'kilo', 'kilogramm', 'kilogram', 'kilograms'] },
   { id: 'ml', label: 'ml', dimension: 'volume', factor: 1, aliases: ['ml', 'milliliter', 'millilitre'] },
   { id: 'l', label: 'l', dimension: 'volume', factor: 1000, aliases: ['l', 'liter', 'litre', 'ltr', 'liters', 'litres'] },
   { id: 'tsp', label: 'TL', dimension: 'spoon', factor: 1, aliases: ['tl', 'teelöffel', 'tsp', 'teaspoon', 'teaspoons'] },
   { id: 'tbsp', label: 'EL', dimension: 'spoon', factor: 3, aliases: ['el', 'esslöffel', 'tbsp', 'tablespoon', 'tablespoons'] },
   { id: 'pinch', label: 'Prise', dimension: 'other', factor: 1, aliases: ['prise', 'prisen', 'pinch', 'pinches'] },
   { id: 'pack', label: 'Pck.', dimension: 'other', factor: 1, aliases: ['pck', 'päckchen', 'packung', 'packungen', 'pkg', 'pack', 'packs', 'pk'] },
   { id: 'can', label: 'Dose', dimension: 'other', factor: 1, aliases: ['dose', 'dosen', 'can', 'cans'] },
   { id: 'bottle', label: 'Flasche', dimension: 'other', factor: 1, aliases: ['fl', 'flasche', 'flaschen', 'bottle', 'bottles'] },
   { id: 'tub', label: 'Becher', dimension: 'other', factor: 1, aliases: ['becher', 'tub', 'tubs', 'pot'] },
   { id: 'bunch', label: 'Bund', dimension: 'other', factor: 1, aliases: ['bund', 'bunch', 'bunches'] },
   { id: 'clove', label: 'Zehe', dimension: 'other', factor: 1, aliases: ['zehe', 'zehen', 'clove', 'cloves'] },
   { id: 'slice', label: 'Scheibe', dimension: 'other', factor: 1, aliases: ['scheibe', 'scheiben', 'slice', 'slices'] },
   { id: 'cup', label: 'Tasse', dimension: 'other', factor: 1, aliases: ['tasse', 'tassen', 'cup', 'cups'] },
] as const satisfies readonly { id: string; label: string; dimension: Dimension; factor: number; aliases: readonly string[] }[]

export type UnitId = (typeof UNITS)[number]['id']
export const UNIT_IDS = UNITS.map((u) => u.id) as UnitId[]

const byId = new Map<string, (typeof UNITS)[number]>(UNITS.map((u) => [u.id, u]))
const byAlias = new Map<string, UnitId>(UNITS.flatMap((u) => u.aliases.map((a) => [a, u.id] as const)))

/** A unit from free text ("EL", "Gramm", "tbsp."), or null. */
export function parseUnit(token: string): UnitId | null {
   return byAlias.get(token.trim().toLowerCase().replace(/\.$/, '')) ?? null
}

export type Amount = { quantity: number | null; unit: UnitId | null }

/** Same dimension (and the same unit for "other"/count units): they can be added up. */
export function canMerge(a: UnitId | null, b: UnitId | null): boolean {
   if (a === b) return true
   if (!a || !b) return false
   const da = byId.get(a)?.dimension
   return da !== undefined && da !== 'other' && da !== 'count' && da === byId.get(b)?.dimension
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Bigger or smaller unit when it reads better: 1500 g → 1.5 kg, 0.25 l → 250 ml, 6 tsp → 2 tbsp. */
export function normalize({ quantity, unit }: Amount): Amount {
   if (quantity === null || !unit) return { quantity: quantity === null ? null : round(quantity), unit }
   const base = quantity * (byId.get(unit)?.factor ?? 1)
   const dim = byId.get(unit)?.dimension
   if (dim === 'mass') return base >= 1000 ? { quantity: round(base / 1000), unit: 'kg' } : { quantity: round(base), unit: 'g' }
   if (dim === 'volume') return base >= 1000 ? { quantity: round(base / 1000), unit: 'l' } : { quantity: round(base), unit: 'ml' }
   if (dim === 'spoon') return base >= 3 && Number.isInteger(round(base / 3)) ? { quantity: round(base / 3), unit: 'tbsp' } : { quantity: round(base), unit: 'tsp' }
   return { quantity: round(quantity), unit }
}

/**
 * Adds two amounts of the same thing, or null when the units don't add up.
 * An amount without a number takes the other's ("Milch" + "2 l Milch" = 2 l).
 */
export function addAmounts(a: Amount, b: Amount): Amount | null {
   if (a.quantity === null && b.quantity === null) return a.unit === b.unit || !a.unit || !b.unit ? { quantity: null, unit: a.unit ?? b.unit } : null
   if (a.quantity === null) return b
   if (b.quantity === null) return a
   if (!canMerge(a.unit, b.unit)) return null
   if (a.unit === b.unit) return normalize({ quantity: a.quantity + b.quantity, unit: a.unit })
   const fa = byId.get(a.unit as UnitId)?.factor ?? 1
   const fb = byId.get(b.unit as UnitId)?.factor ?? 1
   // Sum in the smaller unit, then pick a readable one.
   const small = fa <= fb ? a.unit : b.unit
   const smallFactor = Math.min(fa, fb)
   return normalize({ quantity: (a.quantity * fa + b.quantity * fb) / smallFactor, unit: small })
}
