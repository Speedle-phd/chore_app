import { describe, expect, it } from 'vitest'
import { linkify, relativeTime } from './format'

const NOW = new Date('2026-11-17T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe('relativeTime', () => {
   it('reads naturally for recent posts', () => {
      expect(relativeTime(ago(20_000), NOW)).toBe('just now')
      expect(relativeTime(ago(5 * 60_000), NOW)).toBe('5 min ago')
      expect(relativeTime(ago(59 * 60_000), NOW)).toBe('59 min ago')
      expect(relativeTime(ago(3 * 3600_000), NOW)).toBe('3 h ago')
      expect(relativeTime(ago(30 * 3600_000), NOW)).toBe('yesterday')
   })
   it('shows a date for older ones', () => {
      expect(relativeTime(ago(5 * 24 * 3600_000), NOW)).not.toMatch(/ago|yesterday/)
   })
})

describe('linkify', () => {
   it('keeps plain text as it is', () => {
      expect(linkify('Milk is in the fridge')).toEqual([{ kind: 'text', value: 'Milk is in the fridge' }])
   })
   it('splits out http(s) links, leaving trailing punctuation as text', () => {
      expect(linkify('Recipe: https://example.com/pasta?x=1. Try it!')).toEqual([
         { kind: 'text', value: 'Recipe: ' },
         { kind: 'link', value: 'https://example.com/pasta?x=1' },
         { kind: 'text', value: '. Try it!' },
      ])
      expect(linkify('(see http://a.de)')).toEqual([
         { kind: 'text', value: '(see ' },
         { kind: 'link', value: 'http://a.de' },
         { kind: 'text', value: ')' },
      ])
   })
   it('never makes links from other schemes', () => {
      expect(linkify('javascript:alert(1) and ftp://x')).toEqual([{ kind: 'text', value: 'javascript:alert(1) and ftp://x' }])
   })
})

