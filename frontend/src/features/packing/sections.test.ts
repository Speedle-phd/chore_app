import { describe, expect, it } from 'vitest'
import { bySection, SECTION_IDS } from './sections'

describe('bySection', () => {
   it('groups in display order and leaves out empty sections', () => {
      const groups = bySection([
         { id: 1, section: 'gear' as const },
         { id: 2, section: 'documents' as const },
         { id: 3, section: 'gear' as const },
      ])
      expect(groups.map((g) => [g.section, g.items.map((i) => i.id)])).toEqual([
         ['documents', [2]],
         ['gear', [1, 3]],
      ])
   })

   it('mirrors the server’s sections', () => {
      // backend/src/domain/packing.ts PACKING_SECTIONS
      expect(SECTION_IDS).toEqual(['documents', 'clothes', 'toiletries', 'health', 'electronics', 'gear', 'kids', 'food', 'other'])
   })
})
