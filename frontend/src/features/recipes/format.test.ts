import { describe, expect, it } from 'vitest'
import { formatMinutes, paramsFromQuery, queryFromParams, roundAmount, scaleIngredient } from './format'
import { splitLines, splitSteps } from './formText'

describe('roundAmount (mirrors the server)', () => {
   it.each([
      [300, 'g', 300],
      [19.5, 'g', 20],
      [3.5, 'g', 4],
      [0.75, 'l', 0.75],
      [3, null, 3],
      [0.5, 'tbsp', 0.5],
      [0.99, null, 1],
   ] as const)('%s %s → %s', (q, unit, expected) => {
      expect(roundAmount(q, unit)).toBe(expected)
   })
   it('scales a line', () => {
      expect(scaleIngredient({ text: '', quantity: 400, unit: 'g', name: 'Nudeln', note: '' }, 4, 6).quantity).toBe(600)
      expect(scaleIngredient({ text: '', quantity: null, unit: null, name: 'Salz', note: '' }, 4, 6).quantity).toBeNull()
   })
})

describe('formatMinutes', () => {
   it.each([
      [45, '45 min'],
      [60, '1 h'],
      [75, '1 h 15 min'],
      [0, '0 min'],
      [null, ''],
   ])('%s → %s', (m, text) => {
      expect(formatMinutes(m)).toBe(text)
   })
})

describe('search state in the URL', () => {
   it('round-trips and ignores nonsense', () => {
      const query = { q: 'nudel', tags: ['pasta', 'schnell'], minRating: 4, sort: 'rating' as const }
      const params = paramsFromQuery(query, 'recipes')
      expect(params).toEqual({ tab: 'recipes', q: 'nudel', tags: 'pasta,schnell', min: '4', sort: 'rating' })
      expect(queryFromParams(new URLSearchParams(params))).toEqual(query)
      expect(queryFromParams(new URLSearchParams('min=9&sort=evil'))).toEqual({ q: '', tags: [], minRating: null, sort: 'recent' })
   })
})

describe('form text', () => {
   it('splits ingredients by line and steps by empty line', () => {
      expect(splitLines(' 200 g Mehl \n\n2 Eier\r\n')).toEqual(['200 g Mehl', '2 Eier'])
      expect(splitSteps('Mix.\nStir well.\n\n  \nBake.')).toEqual(['Mix.\nStir well.', 'Bake.'])
   })
})
