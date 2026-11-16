import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { pressedClass } from '@/features/calendar/styles'
import { cn } from '@/lib/utils'
import { PERIODS, type PeriodId } from './periods'

/** This week / month / last 30 days / year: one row above everything it scopes. */
export function PeriodPicker({ value, onChange }: { value: PeriodId; onChange: (period: PeriodId) => void }) {
   return (
      <ToggleGroup
         aria-label='Period'
         variant='outline'
         spacing={1}
         className='flex-wrap'
         value={[value]}
         onValueChange={(v) => v[0] && onChange(v[0] as PeriodId)}
      >
         {PERIODS.map((p) => (
            <ToggleGroupItem key={p.id} value={p.id} className={cn('h-8 px-3', pressedClass)}>
               {p.label}
            </ToggleGroupItem>
         ))}
      </ToggleGroup>
   )
}
