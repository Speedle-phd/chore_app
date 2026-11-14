import { useQuery } from '@tanstack/react-query'

/** Membership ids of a household's members that are online. Filled only by the socket (see useHouseholdRoom). */
export const presenceKey = (householdId: string) => ['household', householdId, 'presence'] as const

/** Applies one presence event to the cached list (pure). */
export function applyPresence(online: string[] | undefined, memberId: string, isOnline: boolean): string[] {
   const current = online ?? []
   if (isOnline) return current.includes(memberId) ? current : [...current, memberId]
   return current.filter((id) => id !== memberId)
}

export function useOnlineMembers(householdId: string): Set<string> {
   const { data } = useQuery({
      queryKey: presenceKey(householdId),
      // Never fetched over HTTP; the socket writes it into the cache.
      queryFn: () => Promise.resolve<string[]>([]),
      enabled: false,
      staleTime: Infinity,
   })
   return new Set(data ?? [])
}
