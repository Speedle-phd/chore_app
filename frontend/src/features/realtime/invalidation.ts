import type { QueryKey } from '@tanstack/react-query'
import type { HouseholdTopic, UserTopic } from './contracts'

/** Which cached queries a household notice makes stale. Pure, so it's easy to reason about. */
export function householdKeys(householdId: string, topics: HouseholdTopic[]): QueryKey[] {
   const keys: QueryKey[] = []
   for (const topic of topics) {
      if (topic === 'members') keys.push(['household', householdId, 'members'], ['households']) // counts in the switcher
      if (topic === 'invitations') keys.push(['household', householdId, 'invitations'])
      // Lists, items, categories and suggestions.
      if (topic === 'shopping') keys.push(['household', householdId, 'shopping'])
      if (topic === 'recipes') keys.push(['household', householdId, 'recipes'])
      if (topic === 'packing') keys.push(['household', householdId, 'packing'])
      if (topic === 'rewards') keys.push(['household', householdId, 'rewards'])
      if (topic === 'pinboard') keys.push(['household', householdId, 'posts'])
      // The motivation switches (incl. rewards) live on the household.
      if (topic === 'household') keys.push(['households'], ['household', householdId, 'stats'], ['household', householdId, 'rewards'])
      // Prefix: every loaded range and every open entry of this household's calendar.
      if (topic === 'calendar') {
         keys.push(
            ['household', householdId, 'calendar'],
            ['household', householdId, 'calendar-item'],
            ['household', householdId, 'calendar-items'],
            ['household', householdId, 'chores'],
            // What reminders will send depends on the entries.
            ['household', householdId, 'reminders'],
            ['household', householdId, 'stats'],
            // Reward balances come from points earned with chores.
            ['household', householdId, 'rewards'],
         )
      }
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
