import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ME_KEY } from '@/api/client'
import type { ServerToClientEvents } from './contracts'
import { householdKeys, userKeys } from './invalidation'
import { socket } from './socket'

/**
 * Keeps the live connection open while signed in and turns server notices into
 * cache invalidations; the affected screens refetch through the normal API.
 */
export function RealtimeConnection() {
   const queryClient = useQueryClient()

   useEffect(() => {
      const invalidate = (keys: readonly (readonly unknown[])[]) => {
         for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
      }
      const onHousehold: ServerToClientEvents['household:changed'] = (e) => invalidate(householdKeys(e.householdId, e.topics))
      const onUser: ServerToClientEvents['user:changed'] = (e) => invalidate(userKeys(e.topics))
      let connectedBefore = false
      const onConnect = () => {
         // After a reconnect, events may have been missed: refetch what's on screen.
         if (connectedBefore) {
            invalidate([['household'], ['households'], ['invitations', 'mine'], ME_KEY])
         }
         connectedBefore = true
      }
      const onDisconnect = (reason: string) => {
         // The server cut us off (logout elsewhere, revoked device, password change): re-check the session.
         if (reason === 'io server disconnect') void queryClient.invalidateQueries({ queryKey: ME_KEY })
      }
      const onConnectError = (error: Error) => {
         if (error.message === 'Not signed in') void queryClient.invalidateQueries({ queryKey: ME_KEY })
      }

      socket.on('household:changed', onHousehold)
      socket.on('user:changed', onUser)
      socket.on('connect', onConnect)
      socket.on('disconnect', onDisconnect)
      socket.on('connect_error', onConnectError)
      socket.connect()
      return () => {
         socket.off('household:changed', onHousehold)
         socket.off('user:changed', onUser)
         socket.off('connect', onConnect)
         socket.off('disconnect', onDisconnect)
         socket.off('connect_error', onConnectError)
         socket.disconnect()
      }
   }, [queryClient])

   return null
}
