import { describe, expect, it } from 'vitest'
import { pruneTyping, typingNow, typingPing, typingStop, typingText } from './typing'

describe('who is typing', () => {
   it('counts someone until 6 s after their last ping', () => {
      const s = typingPing({}, 'ann', 1000)
      expect(typingNow(s, 1000)).toEqual(['ann'])
      expect(typingNow(s, 6999)).toEqual(['ann'])
      expect(typingNow(s, 7000)).toEqual([])
   })

   it('a new ping extends it and keeps the order people started in', () => {
      let s = typingPing({}, 'ann', 0)
      s = typingPing(s, 'ben', 1000)
      s = typingPing(s, 'ann', 5000)
      expect(typingNow(s, 6500)).toEqual(['ann', 'ben'])
      expect(typingNow(s, 7500)).toEqual(['ann'])
   })

   it('a stop removes them at once; stopping someone not typing changes nothing', () => {
      const s = typingPing(typingPing({}, 'ann', 0), 'ben', 0)
      expect(typingNow(typingStop(s, 'ann'), 1)).toEqual(['ben'])
      expect(typingStop(s, 'cid')).toBe(s)
   })

   it('pruning drops expired entries and keeps the same object when nothing expired', () => {
      const s = typingPing(typingPing({}, 'ann', 0), 'ben', 4000)
      expect(pruneTyping(s, 5000)).toBe(s)
      expect(pruneTyping(s, 6000)).toEqual({ ben: 4000 })
   })
})

describe('typingText', () => {
   it.each([
      [[], null],
      [['Ann'], 'Ann is typing'],
      [['Ann', 'Ben'], 'Ann and Ben are typing'],
      [['Ann', 'Ben', 'Cid'], 'Several people are typing'],
   ])('%j → %s', (names, text) => {
      expect(typingText(names)).toBe(text)
   })
})
