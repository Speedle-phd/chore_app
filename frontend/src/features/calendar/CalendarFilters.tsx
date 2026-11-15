import { X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Member } from '@/features/households/householdsApi'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'
import type { CalendarKind } from './calendarApi'
import { ALL_KINDS, KINDS } from './kinds'
import { pressedClass } from './styles'

export type Filters = { kinds: CalendarKind[]; memberIds: string[] }

type CalendarFiltersProps = {
   value: Filters
   onChange: (value: Filters) => void
   members: Member[]
}

/**
 * One row above the calendar: what to show (also the colour legend) and whose.
 * No person selected = everyone.
 */
export function CalendarFilters({ value, onChange, members }: CalendarFiltersProps) {
   const filtered = value.kinds.length < ALL_KINDS.length || value.memberIds.length > 0
   return (
      <div className='mb-4 flex flex-wrap items-center gap-x-6 gap-y-3'>
         <ToggleGroup
            multiple
            aria-label='Show'
            variant='outline'
            spacing={1}
            className='flex-wrap'
            value={value.kinds}
            onValueChange={(kinds) => kinds.length && onChange({ ...value, kinds: kinds as CalendarKind[] })}
         >
            {ALL_KINDS.map((kind) => (
               <ToggleGroupItem
                  key={kind}
                  value={kind}
                  className={cn(
                     'h-8 gap-2 px-3 text-sm font-normal text-muted-foreground',
                     'data-pressed:border-foreground/30 data-pressed:bg-card data-pressed:font-medium data-pressed:text-foreground',
                  )}
               >
                  <span
                     className={cn('size-2.5 rounded-full transition-opacity', !value.kinds.includes(kind) && 'opacity-30')}
                     style={{ background: KINDS[kind].color }}
                     aria-hidden
                  />
                  {KINDS[kind].label}
               </ToggleGroupItem>
            ))}
         </ToggleGroup>

         <div className='flex flex-wrap items-center gap-2'>
            <span id='calendar-people' className='text-sm text-muted-foreground'>
               People
            </span>
            <ToggleGroup
               multiple
               aria-labelledby='calendar-people'
               variant='outline'
               spacing={1}
               className='flex-wrap'
               value={value.memberIds}
               onValueChange={(ids) => onChange({ ...value, memberIds: ids as string[] })}
            >
               {members.map((m) => (
                  <ToggleGroupItem key={m.id} value={m.id} title={m.fullName} className={cn('h-8 gap-1.5 pr-2.5 pl-1', pressedClass)}>
                     <Avatar className='size-6' aria-hidden>
                        <AvatarImage src={avatarSrc(m)} alt='' />
                        <AvatarFallback className='bg-muted text-[0.5625rem] font-semibold text-foreground'>{initials(m)}</AvatarFallback>
                     </Avatar>
                     {m.fname}
                  </ToggleGroupItem>
               ))}
            </ToggleGroup>
            {value.memberIds.length === 0 && <span className='text-sm text-muted-foreground'>(everyone)</span>}
         </div>

         {filtered && (
            <Button variant='ghost' size='sm' onClick={() => onChange({ kinds: ALL_KINDS, memberIds: [] })}>
               <X />
               Show all
            </Button>
         )}
      </div>
   )
}
