import { useEffect } from 'react'
import { socket } from './socket'

/** Receives live updates for the household on screen; switches rooms with the household. */
export function useHouseholdRoom(householdId: string) {
   useEffect(() => {
      const join = () => {
         socket.emit('household:subscribe', householdId, (result) => {
            if (!result.ok) console.warn('Live updates unavailable for this household:', result.error)
         })
      }
      if (socket.connected) join()
      socket.on('connect', join) // also re-joins after every reconnect
      return () => {
         socket.off('connect', join)
         if (socket.connected) socket.emit('household:unsubscribe', householdId, () => undefined)
      }
   }, [householdId])
}
