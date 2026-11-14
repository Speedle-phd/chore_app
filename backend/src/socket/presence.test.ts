import { describe, expect, it } from 'vitest'
import { createPresence } from './presence'

describe('presence', () => {
   it('is online from the first socket until the last one closes', () => {
      const p = createPresence()
      expect(p.connected('u1')).toBe(true) // first tab: came online
      expect(p.connected('u1')).toBe(false) // second tab: already online
      expect(p.disconnected('u1')).toBe(false) // one tab left
      expect(p.isOnline('u1')).toBe(true)
      expect(p.disconnected('u1')).toBe(true) // last tab closed
      expect(p.isOnline('u1')).toBe(false)
   })

   it('tracks users independently and lists who is online', () => {
      const p = createPresence()
      p.connected('a')
      p.connected('b')
      p.disconnected('a')
      expect(p.onlineUserIds()).toEqual(['b'])
   })

   it('never goes negative on a stray disconnect', () => {
      const p = createPresence()
      expect(p.disconnected('ghost')).toBe(true)
      expect(p.isOnline('ghost')).toBe(false)
      expect(p.connected('ghost')).toBe(true)
   })
})
