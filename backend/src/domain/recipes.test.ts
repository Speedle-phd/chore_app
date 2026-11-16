import { describe, expect, it } from 'vitest'
import { parseIngredient } from './ingredients'
import { aggregateIngredients, ratingAverage, roundAmount, scaleIngredients } from './recipes'
import { catalogTag, catalogTagsOnly, normalizeTags, RECIPE_TAGS } from './recipeTags'

describe('parseIngredient', () => {
   it.each([
      ['200 g Mehl', 200, 'g', 'Mehl', ''],
      ['200g Mehl', 200, 'g', 'Mehl', ''],
      ['1,5 l Milch', 1.5, 'l', 'Milch', ''],
      ['2 EL Olivenöl', 2, 'tbsp', 'Olivenöl', ''],
      ['1 TL Salz', 1, 'tsp', 'Salz', ''],
      ['½ TL Zimt', 0.5, 'tsp', 'Zimt', ''],
      ['1 1/2 cups flour', 1.5, 'cup', 'flour', ''],
      ['1½ cups of sugar', 1.5, 'cup', 'sugar', ''],
      ['3/4 tsp baking soda', 0.75, 'tsp', 'baking soda', ''],
      ['2-3 Knoblauchzehen', 3, null, 'Knoblauchzehen', ''],
      ['2 Zehen Knoblauch, gepresst', 2, 'clove', 'Knoblauch', 'gepresst'],
      ['1 Dose (400 g) gehackte Tomaten', 1, 'can', 'gehackte Tomaten', '400 g'],
      ['2 große Zwiebeln, fein gewürfelt', 2, null, 'große Zwiebeln', 'fein gewürfelt'],
      ['1 Prise Salz', 1, 'pinch', 'Salz', ''],
      ['eine Prise Muskat', 1, 'pinch', 'Muskat', ''],
      ['a pinch of salt', 1, 'pinch', 'salt', ''],
      ['etwas Petersilie', null, null, 'Petersilie', 'etwas'],
      ['Salz und Pfeffer nach Belieben', null, null, 'Salz und Pfeffer', 'nach Belieben'],
      ['4 Eier', 4, null, 'Eier', ''],
      ['1 Bund Schnittlauch', 1, 'bunch', 'Schnittlauch', ''],
      ['500 ml Gemüsebrühe (heiß)', 500, 'ml', 'Gemüsebrühe', 'heiß'],
      ['Olivenöl', null, null, 'Olivenöl', ''],
      ['2 Dosen', 2, null, 'Dosen', ''],
   ])('“%s” → %s %s · %s · “%s”', (line, quantity, unit, name, note) => {
      expect(parseIngredient(line)).toEqual({ text: line, quantity, unit, name, note })
   })
})

describe('scaling', () => {
   it.each([
      [200, 'g', 1.5, 300],
      [13, 'g', 1.5, 20],
      [7, 'g', 0.5, 4],
      [0.5, 'l', 1.5, 0.75],
      [2, null, 1.5, 3],
      [1, 'tbsp', 0.5, 0.5],
      [3, null, 0.33, 1],
   ] as const)('%s %s × %s → %s', (q, unit, factor, expected) => {
      expect(roundAmount(q * factor, unit)).toBe(expected)
   })
   it('scales from servings to servings; amount-less stay', () => {
      const scaled = scaleIngredients(
         [
            { quantity: 400, unit: 'g' as const, name: 'Nudeln' },
            { quantity: null, unit: null, name: 'Salz' },
         ],
         4,
         6,
      )
      expect(scaled.map((i) => i.quantity)).toEqual([600, null])
   })
})

describe('aggregateIngredients', () => {
   it('adds the same thing across meals when the units fit; keeps the rest apart', () => {
      const result = aggregateIngredients([
         { recipeId: 'r1', ingredients: [{ name: 'Mehl', quantity: 200, unit: 'g' }, { name: 'Eier', quantity: 2, unit: null }] },
         { recipeId: 'r2', ingredients: [{ name: 'mehl', quantity: 0.5, unit: 'kg' }, { name: 'Eier', quantity: 1, unit: 'pack' }, { name: 'Eier', quantity: 3, unit: null }] },
      ])
      expect(result).toEqual([
         { name: 'Mehl', quantity: 700, unit: 'g', recipeIds: ['r1', 'r2'] },
         { name: 'Eier', quantity: 5, unit: null, recipeIds: ['r1', 'r2'] },
         { name: 'Eier', quantity: 1, unit: 'pack', recipeIds: ['r2'] },
      ])
   })
})

describe('ratings and tags', () => {
   it('averages to one decimal; nobody → null', () => {
      expect(ratingAverage([{ stars: 5 }, { stars: 4 }, { stars: 4 }])).toBe(4.3)
      expect(ratingAverage([])).toBeNull()
   })
   it('tags: catalog spelling for known ones (any case, synonyms), own ones kept, no duplicates', () => {
      expect(normalizeTags([' vegetarisch', 'Vegetarian', 'pasta', 'Omas  Liebling', 'omas liebling', ''])).toEqual(['Vegetarisch', 'Nudeln', 'Omas Liebling'])
   })
   it('imports keep only catalog tags', () => {
      expect(catalogTagsOnly(['Spätzle', 'käse', 'Hauptspeise', 'quick', 'Rezept des Tages'])).toEqual(['Käse', 'Hauptgericht', 'Schnell'])
   })
   it('the catalog has no duplicates, and every synonym points into it', () => {
      expect(new Set(RECIPE_TAGS.map((t) => t.toLowerCase())).size).toBe(RECIPE_TAGS.length)
      expect(RECIPE_TAGS.length).toBeGreaterThan(70)
      for (const word of ['vegan', 'pasta', 'bbq', 'nachtisch', 'thai']) expect(RECIPE_TAGS).toContain(catalogTag(word))
   })
})
