import { Flag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Member } from '@/features/households/householdsApi'
import { PeopleFilter } from '@/features/households/PeopleFilter'
import { cn } from '@/lib/utils'
import type { CalendarKind } from './calendarApi'
import { ALL_KINDS, KINDS } from './kinds'

/** `holidays`: show public holidays (only offered when the household has a state). */
export type Filters = { kinds: CalendarKind[]; memberIds: string[]; holidays: boolean }

const HOLIDAYS = 'holidays'

type CalendarFiltersProps = {
   value: Filters
   onChange: (value: Filters) => void
   members: Member[]
   /** Offer the "Public holidays" toggle. */
   hasHolidays: boolean
}

const itemClass = cn(
   'h-8 gap-2 px-3 text-sm font-normal text-muted-foreground',
   'data-pressed:border-foreground/30 data-pressed:bg-card data-pressed:font-medium data-pressed:text-foreground',
)

/**
 * One row above the calendar: what to show (also the colour legend) and whose.
 * No person selected = everyone.
 */
export function CalendarFilters({ value, onChange, members, hasHolidays }: CalendarFiltersProps) {
   const filtered = value.kinds.length < ALL_KINDS.length || value.memberIds.length > 0 || (hasHolidays && !value.holidays)
   const pressed: string[] = hasHolidays && value.holidays ? [...value.kinds, HOLIDAYS] : value.kinds
   return (
      <div className='mb-4 flex flex-wrap items-center gap-x-6 gap-y-3'>
         <ToggleGroup
            multiple
            aria-label='Show'
            variant='outline'
            spacing={1}
            className='flex-wrap'
            value={pressed}
            onValueChange={(next) => {
               const kinds = ALL_KINDS.filter((k) => next.includes(k))
               // At least one kind of entry stays visible.
               if (kinds.length) onChange({ ...value, kinds, holidays: hasHolidays ? next.includes(HOLIDAYS) : value.holidays })
            }}
         >
            {ALL_KINDS.map((kind) => (
               <ToggleGroupItem key={kind} value={kind} className={itemClass}>
                  <span
                     className={cn('size-2.5 rounded-full transition-opacity', !value.kinds.includes(kind) && 'opacity-30')}
                     style={{ background: KINDS[kind].color }}
                     aria-hidden
                  />
                  {KINDS[kind].label}
               </ToggleGroupItem>
            ))}
            {hasHolidays && (
               <ToggleGroupItem value={HOLIDAYS} className={itemClass}>
                  <Flag className={cn('size-3.5 transition-opacity', !value.holidays && 'opacity-30')} aria-hidden />
                  Public holidays
               </ToggleGroupItem>
            )}
         </ToggleGroup>

         <PeopleFilter members={members} value={value.memberIds} onChange={(memberIds) => onChange({ ...value, memberIds })} />

         {filtered && (
            <Button variant='ghost' size='sm' onClick={() => onChange({ kinds: ALL_KINDS, memberIds: [], holidays: true })}>
               <X />
               Show all
            </Button>
         )}
      </div>
   )
}
