import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerToClientEvents } from '@/features/realtime/contracts'
import { socket } from '@/features/realtime/socket'
import { pruneTyping, TYPING_PING_MS, typingPing, typingStop, type TypingState } from './typing'

/**
 * "Ann is typing…" for the household chat: who else is typing right now (membership ids,
 * in the order they started) and the calls that tell the others about our own typing.
 * Nothing is stored. Only sent while connected: socket.io would otherwise buffer the pings
 * and deliver them late after a reconnect. (Not `volatile`: that also drops packets whenever
 * the transport is busy for a moment.)
 */
const send = (event: 'chat:typing' | 'chat:typing-stop', householdId: string) => {
   if (!socket.connected) return false
   socket.emit(event, householdId)
   return true
}
export function useTyping(householdId: string, myId: string | undefined) {
   const [state, setState] = useState<TypingState>({})

   useEffect(() => {
      const onTyping: ServerToClientEvents['chat:typing'] = (e) => {
         if (e.householdId === householdId && e.memberId !== myId) setState((s) => typingPing(s, e.memberId, Date.now()))
      }
      const onStop: ServerToClientEvents['chat:typing-stop'] = (e) => {
         if (e.householdId === householdId) setState((s) => typingStop(s, e.memberId))
      }
      // Offline we'd miss the stops: forget everyone (they show up again with their next ping).
      const onDisconnect = () => setState({})
      socket.on('chat:typing', onTyping)
      socket.on('chat:typing-stop', onStop)
      socket.on('disconnect', onDisconnect)
      return () => {
         socket.off('chat:typing', onTyping)
         socket.off('chat:typing-stop', onStop)
         socket.off('disconnect', onDisconnect)
         setState({})
      }
   }, [householdId, myId])

   // Expire people whose pings stopped coming (closed the tab, lost the connection).
   const anyone = Object.keys(state).length > 0
   useEffect(() => {
      if (!anyone) return
      const timer = setInterval(() => setState((s) => pruneTyping(s, Date.now())), 1000)
      return () => clearInterval(timer)
   }, [anyone])

   const lastPing = useRef(0)
   const stop = useCallback(() => {
      if (!lastPing.current) return
      lastPing.current = 0
      send('chat:typing-stop', householdId)
   }, [householdId])

   /** Call with the field's text on every change. */
   const changed = useCallback(
      (text: string) => {
         if (!text.trim()) return stop()
         const now = Date.now()
         if (now - lastPing.current < TYPING_PING_MS) return
         // Only a ping that went out counts; offline, the next keystroke tries again.
         if (send('chat:typing', householdId)) lastPing.current = now
      },
      [householdId, stop],
   )

   // Leaving the chat (or switching household) ends our typing.
   useEffect(() => stop, [stop])

   /** Their message arrived: they're done typing. */
   const arrived = useCallback((memberId: string) => setState((s) => typingStop(s, memberId)), [])

   return { typingIds: Object.keys(state), changed, stop, arrived }
}
