import { describe, expect, it } from 'vitest'
import { visibleKinds } from './kinds'

describe('visibleKinds', () => {
   it('nothing saved: everything', () => {
      expect(visibleKinds(null)).toEqual(['chore', 'event', 'birthday', 'vacation', 'meal'])
   })
   it('an old filter (before meals existed) shows meals too', () => {
      expect(visibleKinds({ kinds: ['chore', 'event'] })).toEqual(['chore', 'event', 'meal'])
   })
   it('a filter that knew meals and hid them keeps them hidden', () => {
      expect(visibleKinds({ kinds: ['chore'], seen: ['chore', 'event', 'birthday', 'vacation', 'meal'] })).toEqual(['chore'])
   })
   it('ignores unknown kinds', () => {
      expect(visibleKinds({ kinds: ['party', 'event'], seen: ['party'] })).toEqual(['chore', 'event', 'birthday', 'vacation', 'meal'])
   })
})
