import { describe, expect, it } from 'vitest'
import { groupReactions, isEmoji } from './reactions'

describe('isEmoji', () => {
   it.each(['👍', '❤️', '😂', '🎉', '👍🏽', '👨‍👩‍👧', '🇩🇪', '1️⃣', '🏳️‍🌈', '☕'])('accepts %s', (e) => {
      expect(isEmoji(e)).toBe(true)
   })
   it.each(['', 'a', 'ok', '👍👍', '👍 ', ' 👍', '1', 'x👍', '<b>', '👍a'])('refuses %j', (e) => {
      expect(isEmoji(e)).toBe(false)
   })
})

describe('groupReactions', () => {
   const at = (s: number) => new Date(1_700_000_000_000 + s * 1000)
   it('groups by emoji in first-used order, people in reacting order', () => {
      expect(
         groupReactions([
            { emoji: '😂', memberId: 'ben', at: at(3) },
            { emoji: '👍', memberId: 'ann', at: at(1) },
            { emoji: '👍', memberId: 'ben', at: at(2) },
         ]),
      ).toEqual([
         { emoji: '👍', count: 2, memberIds: ['ann', 'ben'] },
         { emoji: '😂', count: 1, memberIds: ['ben'] },
      ])
   })
   it('is empty without reactions', () => {
      expect(groupReactions([])).toEqual([])
   })
})
