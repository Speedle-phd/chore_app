import { useState } from 'react'
import { Luggage, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { Member } from '@/features/households/householdsApi'
import { viewerTimeZone } from '@/features/calendar/time'
import { tripDaysOf } from './amounts'
import { NewListDialog } from './NewListDialog'
import { usePackingLists } from './packingApi'

/** In a vacation's details: open its packing list, or start one for the people who are away. */
export function VacationPacking({
   householdId,
   vacation,
   members,
}: {
   householdId: string
   vacation: { itemId: string; title: string; memberIds: string[]; allDay: boolean; start: string; end: string }
   members: Member[]
}) {
   const lists = usePackingLists(householdId)
   const [creating, setCreating] = useState(false)
   const linked = (lists.data ?? []).filter((l) => l.vacationId === vacation.itemId).sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)))[0]

   if (lists.isPending) return null
   return (
      <div className='flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3 text-sm'>
         <Luggage className='size-4 text-muted-foreground' aria-hidden />
         {linked ? (
            <>
               <Link
                  to={`/packing/${linked.id}`}
                  className='font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50'
               >
                  Open the packing list
               </Link>
               <span className='text-muted-foreground'>
                  {linked.progress.done} of {linked.progress.total} packed{linked.archivedAt ? ' · archived' : ''}
               </span>
            </>
         ) : (
            <>
               <span className='text-muted-foreground'>No packing list yet.</span>
               <Button variant='outline' size='sm' onClick={() => setCreating(true)} disabled={lists.isError}>
                  <Plus />
                  Packing list
               </Button>
            </>
         )}
         {creating && (
            <NewListDialog
               householdId={householdId}
               members={members}
               initial={{ name: vacation.title, travellerIds: vacation.memberIds, vacationId: vacation.itemId, days: tripDaysOf(vacation, viewerTimeZone()) }}
               onClose={() => setCreating(false)}
            />
         )}
      </div>
   )
}
