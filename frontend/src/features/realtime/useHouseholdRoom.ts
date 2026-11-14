import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ServerToClientEvents } from './contracts'
import { applyPresence, presenceKey } from './presence'
import { socket } from './socket'

/**
 * Receives live updates for the household on screen and keeps its "who's
 * online" list in the query cache; switches rooms with the household.
 */
export function useHouseholdRoom(householdId: string) {
   const queryClient = useQueryClient()

   useEffect(() => {
      const key = presenceKey(householdId)
      // Joining answers with who is online right now.
      const join = () => {
         socket.emit('household:subscribe', householdId, (result) => {
            if (!result.ok) return console.warn('Live updates unavailable for this household:', result.error)
            if (result.data) queryClient.setQueryData(key, result.data.online)
         })
      }
      const onPresence: ServerToClientEvents['presence:changed'] = (e) => {
         if (e.householdId !== householdId) return
         queryClient.setQueryData<string[]>(key, (online) => applyPresence(online, e.memberId, e.online))
      }
      // Someone joined or left: refresh the online list along with the members.
      const onHousehold: ServerToClientEvents['household:changed'] = (e) => {
         if (e.householdId === householdId && e.topics.includes('members')) join()
      }

      if (socket.connected) join()
      socket.on('connect', join) // also re-joins after every reconnect
      socket.on('presence:changed', onPresence)
      socket.on('household:changed', onHousehold)
      return () => {
         socket.off('connect', join)
         socket.off('presence:changed', onPresence)
         socket.off('household:changed', onHousehold)
         if (socket.connected) socket.emit('household:unsubscribe', householdId, () => undefined)
      }
   }, [householdId, queryClient])
}
