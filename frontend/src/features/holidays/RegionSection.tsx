import { useId } from 'react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { selectClass } from '@/features/calendar/styles'
import { useSetRegion, type Household } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'
import { cn } from '@/lib/utils'
import { STATE_CODES, STATES, type StateCode } from './holidaysApi'

/** Settings: the Bundesland whose public holidays the calendar shows (owners and admins). */
export function RegionSection({ household }: { household: Household }) {
   const id = useId()
   const save = useSetRegion(household.id)
   const allowed = canManage(household.role)
   return (
      <div className='space-y-2'>
         <label htmlFor={id} className='block text-sm font-medium'>
            State
         </label>
         <select
            id={id}
            className={cn(selectClass, 'w-full sm:w-72')}
            value={household.region.state ?? ''}
            disabled={!allowed || save.isPending}
            onChange={(e) => {
               const state = (e.target.value || null) as StateCode | null
               save.mutate(state, {
                  onSuccess: () => toast.success(state ? `Showing public holidays in ${STATES[state]}` : 'Public holidays hidden'),
                  onError: (error) => toast.error(apiError(error).message),
               })
            }}
         >
            <option value=''>None (don’t show holidays)</option>
            {STATE_CODES.map((code) => (
               <option key={code} value={code}>
                  {STATES[code]}
               </option>
            ))}
         </select>
         {!allowed && <p className='text-sm text-muted-foreground'>Only owners and admins can change this.</p>}
      </div>
   )
}
