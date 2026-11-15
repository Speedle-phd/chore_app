import { Plane } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useChangeOccurrence, type CalendarInstance, type ChoreInfo } from '@/features/calendar/calendarApi'
import type { Member } from '@/features/households/householdsApi'
import { cn } from '@/lib/utils'
import { conflictText } from './format'

type Conflict = NonNullable<ChoreInfo['conflict']>

/** "Ada is away · [Give to Ben]": accepting reassigns just this date. */
export function ConflictNotice({
   householdId,
   instance,
   members,
   className,
}: {
   householdId: string
   instance: CalendarInstance & { chore: ChoreInfo & { conflict: Conflict } }
   members: Member[]
   className?: string
}) {
   const change = useChangeOccurrence(householdId)
   const { conflict } = instance.chore
   const { awayText, action } = conflictText(conflict, instance.memberIds, members)
   return (
      <div className={cn('flex flex-wrap items-center gap-2 text-sm', className)}>
         <span className='flex items-center gap-1.5 font-medium'>
            <Plane className='size-3.5 text-primary' aria-hidden />
            {awayText}
         </span>
         {action ? (
            <Button
               size='sm'
               variant='outline'
               disabled={change.isPending}
               onClick={() =>
                  change.mutate(
                     {
                        ref: { itemId: instance.itemId, originalStart: instance.originalStart },
                        scope: 'this',
                        change: { memberIds: conflict.suggestion ?? [] },
                     },
                     {
                        onSuccess: () => toast.success('Reassigned for this date'),
                        onError: (e) => toast.error(apiError(e).message),
                     },
                  )
               }
            >
               {action}
            </Button>
         ) : (
            <span className='text-muted-foreground'>Nobody else is free.</span>
         )}
      </div>
   )
}
