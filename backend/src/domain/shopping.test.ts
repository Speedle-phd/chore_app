import { describe, expect, it } from 'vitest'
import { GROCERY_CATALOG_DE } from './groceryCatalog.de'
import { mergeInto, nameKey, suggest, type ListItem, type Remembered } from './shopping'
import { DEFAULT_CATEGORIES } from './shoppingCategories'
import { addAmounts, canMerge, normalize, parseUnit, UNITS } from './units'

describe('units', () => {
   it.each([
      ['EL', 'tbsp'],
      ['el.', 'tbsp'],
      ['TL', 'tsp'],
      ['Gramm', 'g'],
      ['Stk.', 'pcs'],
      ['Päckchen', 'pack'],
      ['Prise', 'pinch'],
      ['Zehen', 'clove'],
      ['cups', 'cup'],
      ['handful', null],
   ])('parseUnit(%s) → %s', (token, unit) => {
      expect(parseUnit(token)).toBe(unit)
   })

   it('every alias belongs to one unit only', () => {
      const aliases = UNITS.flatMap((u) => [...u.aliases])
      expect(new Set(aliases).size).toBe(aliases.length)
   })

   it('merges within mass, volume and spoons; other units only with themselves', () => {
      expect(canMerge('g', 'kg')).toBe(true)
      expect(canMerge('ml', 'l')).toBe(true)
      expect(canMerge('tsp', 'tbsp')).toBe(true)
      expect(canMerge('g', 'ml')).toBe(false)
      expect(canMerge('can', 'can')).toBe(true)
      expect(canMerge('can', 'bottle')).toBe(false)
      expect(canMerge(null, 'g')).toBe(false)
      expect(canMerge(null, null)).toBe(true)
   })

   it.each([
      [{ quantity: 1500, unit: 'g' }, { quantity: 1.5, unit: 'kg' }],
      [{ quantity: 0.25, unit: 'l' }, { quantity: 250, unit: 'ml' }],
      [{ quantity: 6, unit: 'tsp' }, { quantity: 2, unit: 'tbsp' }],
      [{ quantity: 4, unit: 'tsp' }, { quantity: 4, unit: 'tsp' }],
      [{ quantity: 2, unit: 'can' }, { quantity: 2, unit: 'can' }],
   ] as const)('normalize %j → %j', (amount, expected) => {
      expect(normalize(amount)).toEqual(expected)
   })

   it('adds amounts', () => {
      expect(addAmounts({ quantity: 500, unit: 'g' }, { quantity: 1, unit: 'kg' })).toEqual({ quantity: 1.5, unit: 'kg' })
      expect(addAmounts({ quantity: 1, unit: 'tbsp' }, { quantity: 1, unit: 'tsp' })).toEqual({ quantity: 4, unit: 'tsp' })
      expect(addAmounts({ quantity: 2, unit: null }, { quantity: 3, unit: null })).toEqual({ quantity: 5, unit: null })
      expect(addAmounts({ quantity: null, unit: null }, { quantity: 2, unit: 'l' })).toEqual({ quantity: 2, unit: 'l' })
      expect(addAmounts({ quantity: 1, unit: 'can' }, { quantity: 200, unit: 'g' })).toBeNull()
   })
})

describe('nameKey', () => {
   it('ignores case, spacing and ß/ss', () => {
      expect(nameKey('  Grüne   Bohnen ')).toBe('grüne bohnen')
      expect(nameKey('Weißkohl')).toBe(nameKey('weisskohl'))
   })
})

describe('mergeInto', () => {
   const item = (over: Partial<ListItem>): ListItem => ({ id: 'a', nameKey: 'milch', quantity: 1, unit: 'l', checked: false, ...over })
   it('adds to an open item with a compatible unit', () => {
      expect(mergeInto([item({})], { nameKey: 'milch', quantity: 500, unit: 'ml' })).toEqual({ kind: 'update', id: 'a', quantity: 1.5, unit: 'l', uncheck: false })
   })
   it('takes an item out of the basket with the new amount', () => {
      expect(mergeInto([item({ checked: true })], { nameKey: 'milch', quantity: 2, unit: 'l' })).toEqual({ kind: 'update', id: 'a', quantity: 2, unit: 'l', uncheck: true })
   })
   it('new line when the units don’t add up or the name differs', () => {
      expect(mergeInto([item({})], { nameKey: 'milch', quantity: 2, unit: 'bottle' })).toEqual({ kind: 'create' })
      expect(mergeInto([item({})], { nameKey: 'butter', quantity: 1, unit: null })).toEqual({ kind: 'create' })
   })
})

describe('suggest', () => {
   const memory: Remembered[] = [
      { name: 'Hafermilch', nameKey: 'hafermilch', categoryId: 'c1', unit: 'l', quantity: 2, uses: 9, lastUsedAt: 1 },
      { name: 'Milch', nameKey: 'milch', categoryId: 'c1', unit: 'l', quantity: 1, uses: 3, lastUsedAt: 2 },
      { name: 'Brot', nameKey: 'brot', categoryId: 'c2', unit: null, quantity: null, uses: 20, lastUsedAt: 3 },
   ]
   it('history first (prefix before infix), then the catalog without duplicates', () => {
      const result = suggest('milch', memory, GROCERY_CATALOG_DE)
      expect(result.slice(0, 2).map((s) => [s.name, s.source])).toEqual([
         ['Milch', 'history'],
         ['Hafermilch', 'history'],
      ])
      expect(result.filter((s) => s.name === 'Milch')).toHaveLength(1)
      expect(result.find((s) => s.name === 'Buttermilch')).toMatchObject({ source: 'catalog', categoryKey: 'fridge', unit: 'l' })
   })
   it('matches word starts in the catalog (“tomaten” finds “Passierte Tomaten”)', () => {
      expect(suggest('tomaten', [], GROCERY_CATALOG_DE).map((s) => s.name)).toEqual(
         expect.arrayContaining(['Tomaten', 'Passierte Tomaten', 'Gehackte Tomaten']),
      )
   })
   it('nothing typed: most used items', () => {
      expect(suggest('', memory, GROCERY_CATALOG_DE).map((s) => s.name)).toEqual(['Brot', 'Hafermilch', 'Milch'])
   })
   it('at most 8', () => {
      expect(suggest('e', [], GROCERY_CATALOG_DE)).toHaveLength(8)
   })
})

describe('catalog', () => {
   it('has unique names and only known categories', () => {
      const keys = GROCERY_CATALOG_DE.map((c) => nameKey(c.name))
      expect(new Set(keys).size).toBe(keys.length)
      const known = new Set<string>(DEFAULT_CATEGORIES.map((d) => d.key))
      expect(GROCERY_CATALOG_DE.every((c) => known.has(c.category))).toBe(true)
      expect(GROCERY_CATALOG_DE.length).toBeGreaterThan(250)
   })
})
