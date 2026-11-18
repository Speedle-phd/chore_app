import { describe, expect, it } from 'vitest'
import type { ChatMessage } from './chatApi'
import { dayLabel, groupMessages } from './grouping'

// Local times (the test runs in whatever zone the machine has; dates are built locally).
const local = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()
const NOW = new Date(2026, 10, 17, 18, 0)
const msg = (id: string, authorId: string, createdAt: string): ChatMessage => ({ id, authorId, text: id, deleted: false, editedAt: null, reactions: [], createdAt })

describe('dayLabel', () => {
   it('says Today and Yesterday, else the date', () => {
      expect(dayLabel(local(2026, 11, 17, 0, 5), NOW)).toBe('Today')
      expect(dayLabel(local(2026, 11, 16, 23, 59), NOW)).toBe('Yesterday')
      expect(dayLabel(local(2026, 11, 10, 12), NOW)).not.toMatch(/Today|Yesterday|2026/)
      expect(dayLabel(local(2025, 11, 10, 12), NOW)).toMatch(/2025/)
   })
})

describe('groupMessages', () => {
   it('splits by local day and marks where a person’s run starts', () => {
      const days = groupMessages(
         [
            msg('a', 'ann', local(2026, 11, 16, 20, 0)),
            msg('b', 'ann', local(2026, 11, 17, 9, 0)),
            msg('c', 'ann', local(2026, 11, 17, 9, 3)),
            msg('d', 'ben', local(2026, 11, 17, 9, 4)),
            msg('e', 'ben', local(2026, 11, 17, 9, 20)),
         ],
         NOW,
      )
      expect(days.map((d) => d.label)).toEqual(['Yesterday', 'Today'])
      expect(days[1]?.rows.map((r) => [r.message.id, r.first])).toEqual([
         ['b', true], // new day
         ['c', false], // same person within 5 minutes
         ['d', true], // someone else
         ['e', true], // more than 5 minutes later
      ])
   })
   it('handles no messages', () => {
      expect(groupMessages([], NOW)).toEqual([])
   })
})
