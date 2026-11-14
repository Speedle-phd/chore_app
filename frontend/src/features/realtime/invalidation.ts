import type { QueryKey } from '@tanstack/react-query'
import type { HouseholdTopic, UserTopic } from './contracts'

/** Which cached queries a household notice makes stale. Pure, so it's easy to reason about. */
export function householdKeys(householdId: string, topics: HouseholdTopic[]): QueryKey[] {
   const keys: QueryKey[] = []
   for (const topic of topics) {
      if (topic === 'members') keys.push(['household', householdId, 'members'], ['households']) // counts in the switcher
      if (topic === 'invitations') keys.push(['household', householdId, 'invitations'])
      if (topic === 'household') keys.push(['households'])
   }
   return keys
}

/** Which cached queries a personal notice makes stale. */
export function userKeys(topics: UserTopic[]): QueryKey[] {
   const keys: QueryKey[] = []
   for (const topic of topics) {
      // Losing a household can also clear the remembered one, so refresh "me" too.
      if (topic === 'households') keys.push(['households'], ['me'])
      if (topic === 'invitations') keys.push(['invitations', 'mine'])
      if (topic === 'profile') keys.push(['me'])
   }
   return keys
}
