import { describe, expect, it } from 'vitest'
import type { ShoppingCategory, ShoppingItem } from './shoppingApi'
import { formatAmount, groupByCategory, parseQuantity } from './units'

describe('formatAmount', () => {
   it.each([
      [1.5, 'l', 'en', '1.5 l'],
      [1.5, 'l', 'de', '1,5 l'],
      [2, null, 'en', '2 ×'],
      [null, 'bunch', 'en', 'Bund'],
      [1, 'can', 'de', '1 Dose'],
      [2, 'can', 'de', '2 Dosen'],
      [0.5, 'pinch', 'de', '0,5 Prise'],
      [2, 'tbsp', 'de', '2 EL'],
      [3, 'pcs', 'de', '3 Stk.'],
      [null, 'pcs', 'en', ''],
      [null, null, 'en', ''],
      [1 / 3, 'kg', 'en', '0.33 kg'],
   ] as const)('%s %s (%s) → “%s”', (q, unit, locale, text) => {
      expect(formatAmount(q, unit, locale)).toBe(text)
   })
})

describe('parseQuantity', () => {
   it.each([
      ['', null],
      ['2', 2],
      ['1,5', 1.5],
      ['0.25', 0.25],
      ['½', 0.5],
      ['3/4', 0.75],
      ['0', undefined],
      ['abc', undefined],
   ])('“%s” → %s', (text, n) => {
      expect(parseQuantity(text)).toBe(n)
   })
})

describe('groupByCategory', () => {
   const cat = (id: string, position: number): ShoppingCategory => ({ id, key: null, name: id, icon: 'package', position })
   const item = (name: string, categoryId: string | null, checked = false) => ({ id: name, name, categoryId, checked }) as ShoppingItem
   it('follows the category order, sorts by name, leaves out the basket, puts uncategorized last', () => {
      const sections = groupByCategory(
         [item('Milch', 'fridge'), item('Äpfel', 'produce'), item('Butter', 'fridge'), item('Zange', null), item('Brot', 'bakery', true), item('Ghost', 'deleted')],
         [cat('fridge', 2), cat('produce', 0), cat('bakery', 1)],
      )
      expect(sections.map((s) => [s.category?.id ?? null, s.items.map((i) => i.name)])).toEqual([
         ['produce', ['Äpfel']],
         ['fridge', ['Butter', 'Milch']],
         [null, ['Ghost', 'Zange']],
      ])
   })
})
