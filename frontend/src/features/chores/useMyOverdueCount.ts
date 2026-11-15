import { useChoreAgenda } from '@/features/calendar/calendarApi'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { isMine } from './format'

/** Overdue chores for me (assigned to me or to nobody), for the navigation badge. */
export function useMyOverdueCount(): number {
   const household = useHousehold()
   const agenda = useChoreAgenda(household.id)
   const members = useMembers(household.id)
   const me = members.data?.find((m) => m.isMe)?.id
   // `chore.overdue` flips at once when someone marks it (before the refetch), so the badge updates instantly.
   return (agenda.data?.overdue ?? []).filter((i) => i.chore?.overdue && isMine(i, me)).length
}
