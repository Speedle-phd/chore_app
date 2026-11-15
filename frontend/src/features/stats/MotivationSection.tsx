import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Checkbox } from '@/components/ui/checkbox'
import { useSetMotivation, type Household } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'

const OPTIONS = [
   { key: 'leaderboard', label: 'Leaderboard', hint: 'Rank people by points in the chore stats.' },
   { key: 'streaks', label: 'Streaks', hint: 'Show how many days in a row someone did chores.' },
   { key: 'badges', label: 'Badges', hint: 'Award badges for milestones (first chore, 7-day streak, …).' },
] as const

/** Settings: switch the leaderboard, streaks and badges on or off for the household. */
export function MotivationSection({ household }: { household: Household }) {
   const save = useSetMotivation(household.id)
   const allowed = canManage(household.role)
   return (
      <div className='space-y-3'>
         {OPTIONS.map((o) => (
            <label key={o.key} className='flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-data-disabled:cursor-default'>
               <Checkbox
                  className='mt-0.5'
                  checked={household.motivation[o.key]}
                  disabled={!allowed || save.isPending}
                  onCheckedChange={(on) =>
                     save.mutate(
                        { [o.key]: on },
                        {
                           onSuccess: () => toast.success(`${o.label} ${on ? 'on' : 'off'}`),
                           onError: (e) => toast.error(apiError(e).message),
                        },
                     )
                  }
               />
               <span className='text-sm'>
                  <span className='block font-medium'>{o.label}</span>
                  <span className='block text-muted-foreground'>{o.hint}</span>
               </span>
            </label>
         ))}
         {!allowed && <p className='text-sm text-muted-foreground'>Only owners and admins can change these.</p>}
      </div>
   )
}
