import { describe, expect, it } from 'vitest'
import { cleanOptions, editOption, MAX_OPTIONS, moveOption, removeOption } from './pollDraft'

describe('editOption', () => {
   it('adds an empty field once the last one gets text', () => {
      expect(editOption(['Pizza', ''], 1, 'P')).toEqual(['Pizza', 'P', ''])
      expect(editOption(['Pizza', 'Pasta', ''], 2, 'C')).toEqual(['Pizza', 'Pasta', 'C', ''])
   })
   it('drops the extra empty field when the one before is cleared again', () => {
      expect(editOption(['Pizza', 'Pasta', 'C', ''], 2, '')).toEqual(['Pizza', 'Pasta', ''])
   })
   it('never goes below two fields, and keeps an empty one in the middle while typing', () => {
      expect(editOption(['', ''], 0, 'A')).toEqual(['A', ''])
      expect(editOption(['A', 'B', 'C', ''], 1, '')).toEqual(['A', '', 'C', ''])
   })
   it('stops adding at the limit', () => {
      const nine = Array.from({ length: MAX_OPTIONS - 1 }, (_, i) => `O${i}`)
      expect(editOption([...nine, ''], MAX_OPTIONS - 1, 'last')).toHaveLength(MAX_OPTIONS)
   })
})

describe('removeOption', () => {
   it('removes a field and keeps the empty one at the end', () => {
      expect(removeOption(['A', 'B', 'C', ''], 1)).toEqual(['A', 'C', ''])
      expect(removeOption(['A', 'B', ''], 0)).toEqual(['B', ''])
   })
})

describe('moveOption', () => {
   it('swaps with the neighbour', () => {
      expect(moveOption(['A', 'B', 'C', ''], 2, -1)).toEqual(['A', 'C', 'B', ''])
      expect(moveOption(['A', 'B', 'C', ''], 0, 1)).toEqual(['B', 'A', 'C', ''])
   })
   it('doesn’t move past the ends or the empty draft field', () => {
      expect(moveOption(['A', 'B', ''], 0, -1)).toEqual(['A', 'B', ''])
      expect(moveOption(['A', 'B', ''], 1, 1)).toEqual(['A', 'B', ''])
   })
})

describe('cleanOptions', () => {
   it('trims and drops empty fields', () => {
      expect(cleanOptions([' Pizza ', '', 'Pasta', ''])).toEqual(['Pizza', 'Pasta'])
   })
})
