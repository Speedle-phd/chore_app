import { useSyncExternalStore } from 'react'
import { seenKey } from './format'

/**
 * When this device last looked at the pinboard, per household (localStorage, a per-device
 * convenience). Shared between the board (marks it) and the header dot (reads it).
 */
const listeners = new Set<() => void>()

function read(householdId: string): string | null {
   try {
      return window.localStorage.getItem(seenKey(householdId))
   } catch {
      return null // storage blocked: every post counts as new until the board is opened
   }
}

export function markSeen(householdId: string, at: string) {
   try {
      if ((read(householdId) ?? '') >= at) return
      window.localStorage.setItem(seenKey(householdId), at)
   } catch {
      // Storage blocked (private mode): nothing to remember; the dot just stays.
   }
   for (const notify of listeners) notify()
}

export function useSeenAt(householdId: string) {
   return useSyncExternalStore(
      (notify) => {
         listeners.add(notify)
         return () => listeners.delete(notify)
      },
      () => read(householdId),
   )
}
