import { describe, expect, it } from 'vitest'
import { addRecent, insertAt, searchEmojis } from './emoji'
import { EMOJI_GROUPS } from './emojiData'

describe('emoji data', () => {
   it('has each emoji once and a name for every one', () => {
      const all = EMOJI_GROUPS.flatMap((g) => g.emojis)
      expect(new Set(all.map((x) => x.char)).size).toBe(all.length)
      expect(all.every((x) => x.name.trim().length > 0)).toBe(true)
   })
})

describe('searchEmojis', () => {
   it('returns everything for an empty query', () => {
      expect(searchEmojis(' ')).toHaveLength(EMOJI_GROUPS.length)
   })
   it('matches every word in the name, any case', () => {
      const chars = (q: string) => searchEmojis(q).flatMap((g) => g.emojis.map((x) => x.char))
      expect(chars('PIZZA')).toEqual(['🍕'])
      expect(chars('heart')).toContain('❤️')
      expect(chars('red heart')).toEqual(['❤️'])
      expect(chars('pasta')).toEqual(['🍝'])
      expect(searchEmojis('zzzz-nothing')).toEqual([])
   })
})

describe('insertAt', () => {
   it('inserts at the caret and moves the caret behind it', () => {
      expect(insertAt('Hi there', 2, 2, ' 👋')).toEqual({ value: 'Hi 👋 there', caret: 5 })
   })
   it('replaces a selection', () => {
      expect(insertAt('Hi there', 3, 8, '👋')).toEqual({ value: 'Hi 👋', caret: 5 })
   })
   it('appends when there is no caret', () => {
      expect(insertAt('Hi', null, null, '👋')).toEqual({ value: 'Hi👋', caret: 4 })
   })
})

describe('addRecent', () => {
   it('puts the newest first, each once, and keeps the list short', () => {
      expect(addRecent(['😀', '👍'], '👍')).toEqual(['👍', '😀'])
      expect(addRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
   })
})
