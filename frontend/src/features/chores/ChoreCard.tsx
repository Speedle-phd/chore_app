import { AlertTriangle, Check, CircleSlash, Repeat } from 'lucide-react'
import { AvatarStack } from '@/features/calendar/AvatarStack'
import type { CalendarInstance, ChoreInfo } from '@/features/calendar/calendarApi'
import { KINDS } from '@/features/calendar/kinds'
import type { Member, Role } from '@/features/households/householdsApi'
import { cn } from '@/lib/utils'
import { ChoreActions } from './ChoreActions'
import { ConflictNotice } from './ConflictNotice'
import { whenText } from './format'

type ChoreCardProps = {
   householdId: string
   instance: CalendarInstance & { chore: ChoreInfo }
   members: Member[]
   role: Role
   today: string
   zone: string
   onOpen: (instance: CalendarInstance) => void
}

export function EffortDots({ effort }: { effort: number }) {
   return (
      <span role='img' aria-label={`Effort ${effort} of 5`} title={`Effort ${effort} of 5`} className='flex gap-0.5'>
         {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={cn('size-1.5 rounded-full', n <= effort ? 'bg-primary' : 'bg-foreground/15')} />
         ))}
      </span>
   )
}

/** One chore occurrence in a list: what, when, who, and the action to settle it. */
export function ChoreCard({ householdId, instance, members, role, today, zone, onOpen }: ChoreCardProps) {
   const { chore } = instance
   const settled = chore.state === 'done' || chore.state === 'skipped'
   const people = instance.memberIds.flatMap((id) => members.find((m) => m.id === id) ?? [])
   const doneCount = chore.completions.filter((c) => instance.memberIds.includes(c.memberId)).length

   return (
      <li
         className={cn(
            'flex flex-col gap-3 rounded-xl border bg-card p-3 transition-colors sm:flex-row sm:items-center',
            chore.overdue && 'border-destructive/40 bg-destructive/5',
         )}
      >
         <span aria-hidden className='hidden h-10 w-1 shrink-0 rounded-full sm:block' style={{ background: KINDS.chore.color }} />
         <button
            type='button'
            onClick={() => onOpen(instance)}
            className='flex min-w-0 flex-1 flex-col items-start gap-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
         >
            <span className='flex w-full min-w-0 items-center gap-2'>
               {chore.state === 'done' && <Check className='size-4 shrink-0 text-primary' aria-label='Done' />}
               {chore.state === 'skipped' && <CircleSlash className='size-4 shrink-0 text-muted-foreground' aria-label='Skipped' />}
               <span className={cn('truncate font-medium', settled && 'text-muted-foreground line-through')}>{instance.title}</span>
               {instance.recurring && <Repeat aria-label='Repeats' className='size-3.5 shrink-0 text-muted-foreground' />}
            </span>
            {/* On the tinted overdue card, muted text would fall below 4.5:1. */}
            <span
               className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm',
                  chore.overdue ? 'text-foreground' : 'text-muted-foreground',
               )}
            >
               {chore.overdue && (
                  <span className='flex items-center gap-1 font-medium text-foreground'>
                     <AlertTriangle className='size-3.5 text-destructive' aria-hidden />
                     Overdue
                  </span>
               )}
               <span>{whenText(instance, today, zone)}</span>
               <EffortDots effort={chore.effort} />
               {chore.state === 'partial' && (
                  <span>
                     {doneCount} of {instance.memberIds.length} done
                  </span>
               )}
               {people.length > 0 && <AvatarStack people={people} size='sm' />}
            </span>
         </button>
         {chore.conflict && (
            <ConflictNotice
               householdId={householdId}
               instance={{ ...instance, chore: { ...chore, conflict: chore.conflict } }}
               members={members}
               className='sm:order-none'
            />
         )}
         <div className='shrink-0 sm:ms-auto'>
            <ChoreActions householdId={householdId} instance={instance} members={members} role={role} />
         </div>
      </li>
   )
}
