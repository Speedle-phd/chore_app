/**
 * Who is online: a user with at least one connected socket (tab/device).
 * In memory, so it assumes a single backend instance (see DEPLOY.md).
 */
export function createPresence() {
   const sockets = new Map<string, number>()
   return {
      /** Returns true when this is the user's first socket (they just came online). */
      connected(userId: string) {
         const n = (sockets.get(userId) ?? 0) + 1
         sockets.set(userId, n)
         return n === 1
      },
      /** Returns true when that was the user's last socket (they may be going offline). */
      disconnected(userId: string) {
         const n = (sockets.get(userId) ?? 1) - 1
         if (n <= 0) sockets.delete(userId)
         else sockets.set(userId, n)
         return n <= 0
      },
      isOnline: (userId: string) => sockets.has(userId),
      onlineUserIds: () => [...sockets.keys()],
   }
}

export type Presence = ReturnType<typeof createPresence>
