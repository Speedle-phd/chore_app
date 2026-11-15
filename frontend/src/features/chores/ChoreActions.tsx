import { Check, ChevronDown, CircleSlash, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSetStatus, type CalendarInstance, type ChoreInfo, type CompletionStatus } from '@/features/calendar/calendarApi'
import { isSettled } from '@/features/calendar/choreState'
import type { Member, Role } from '@/features/households/householdsApi'
import { canMarkChoreFor } from '@/features/households/permissions'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'

type ChoreActionsProps = {
   householdId: string
   instance: CalendarInstance & { chore: ChoreInfo }
   members: Member[]
   role: Role
   /** Compact: one row for lists; full: per-person rows for the details dialog. */
   variant?: 'compact' | 'full'
}

const time = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** Done / skip / undo for one chore occurrence, for yourself or people you may mark for. */
export function ChoreActions({ householdId, instance, members, role, variant = 'compact' }: ChoreActionsProps) {
   const setStatus = useSetStatus(householdId)
   const me = members.find((m) => m.isMe)
   const byId = new Map(members.map((m) => [m.id, m]))
   const mayMarkFor = (m: Member | undefined) => Boolean(m && canMarkChoreFor(role, m.isMe, m.kind === 'account'))
   const name = (id: string) => byId.get(id)?.fname ?? 'Former member'
   const { chore } = instance
   const perPerson = chore.assignmentMode === 'everyone' && instance.memberIds.length > 0

   const mark = (memberId: string, status: CompletionStatus | 'open') => {
      if (!me) return
      setStatus.mutate(
         { ref: { itemId: instance.itemId, originalStart: instance.originalStart }, status, memberId, by: me.id },
         { onError: (e) => toast.error(apiError(e).message) },
      )
   }

   // Everyone does their part: one row per assignee.
   if (perPerson) {
      return (
         <ul className={cn('space-y-1.5', variant === 'compact' && 'text-sm')} aria-label={`${instance.title}: who did their part`}>
            {instance.memberIds.map((id) => {
               const person = byId.get(id)
               const completion = chore.completions.find((c) => c.memberId === id)
               const allowed = mayMarkFor(person)
               return (
                  <li key={id} className='flex items-center gap-2'>
                     <PersonAvatar person={person} />
                     <span className='min-w-0 flex-1 truncate'>
                        {person?.fname ?? 'Former member'}
                        {completion && (
                           <span className='text-muted-foreground'>
                              {' · '}
                              {completion.status === 'done' ? 'done' : 'skipped'}
                           </span>
                        )}
                     </span>
                     {!allowed ? (
                        // Not mine to mark (another account): show where it stands instead of dead buttons.
                        !completion && (
                           <span className='text-sm text-muted-foreground'>
                              not yet<span className='sr-only'> (only {person?.fname ?? 'they'} or an admin can mark it)</span>
                           </span>
                        )
                     ) : completion ? (
                        <Button
                           size='sm'
                           variant='ghost'
                           disabled={!allowed || setStatus.isPending}
                           onClick={() => mark(id, 'open')}
                           aria-label={`Undo for ${person?.fname ?? 'former member'}`}
                        >
                           <Undo2 />
                           Undo
                        </Button>
                     ) : (
                        <span className='flex gap-1'>
                           <Button
                              size='sm'
                              disabled={!allowed || setStatus.isPending}
                              onClick={() => mark(id, 'done')}
                              aria-label={`Done: ${person?.fname ?? 'former member'}`}
                           >
                              <Check />
                              Done
                           </Button>
                           <Button
                              size='sm'
                              variant='ghost'
                              disabled={!allowed || setStatus.isPending}
                              onClick={() => mark(id, 'skipped')}
                              aria-label={`Skip: ${person?.fname ?? 'former member'}`}
                           >
                              Skip
                           </Button>
                        </span>
                     )}
                  </li>
               )
            })}
         </ul>
      )
   }

   // Any one of them: a single action, done by me by default.
   if (isSettled(chore.state)) {
      const settling = chore.completions.find((c) => c.status === 'done') ?? chore.completions[0]
      const undoable = settling && mayMarkFor(byId.get(settling.memberId))
      return (
         <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span className='flex items-center gap-1.5 text-muted-foreground'>
               {chore.state === 'done' ? (
                  <Check className='size-4 text-primary' aria-hidden />
               ) : (
                  <CircleSlash className='size-4' aria-hidden />
               )}
               {settling ? `${chore.state === 'done' ? 'Done' : 'Skipped'} by ${name(settling.memberId)}` : 'Done'}
               {variant === 'full' && settling && <span>· {time(settling.at)}</span>}
            </span>
            {settling && (
               <Button size='sm' variant='ghost' disabled={!undoable || setStatus.isPending} onClick={() => mark(settling.memberId, 'open')}>
                  <Undo2 />
                  Undo
               </Button>
            )}
         </div>
      )
   }

   const others = instance.memberIds
      .map((id) => byId.get(id))
      .filter((m): m is Member => Boolean(m && !m.isMe && mayMarkFor(m)))
   return (
      <div className='flex items-center'>
         <Button
            size='sm'
            className='rounded-e-none'
            disabled={!me || setStatus.isPending}
            onClick={() => me && mark(me.id, 'done')}
            aria-label={`Mark “${instance.title}” done`}
         >
            <Check />
            Done
         </Button>
         <DropdownMenu>
            <DropdownMenuTrigger
               aria-label={`More for “${instance.title}”`}
               disabled={!me || setStatus.isPending}
               className='inline-flex h-8 items-center rounded-e-lg border-s border-primary-foreground/30 bg-primary px-1.5 text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'
            >
               <ChevronDown className='size-4' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='min-w-48'>
               {others.length > 0 && (
                  <>
                     <DropdownMenuGroup>
                        <DropdownMenuLabel>Done by someone else</DropdownMenuLabel>
                        {others.map((m) => (
                           <DropdownMenuItem key={m.id} onClick={() => mark(m.id, 'done')}>
                              <PersonAvatar person={m} />
                              {m.fname}
                           </DropdownMenuItem>
                        ))}
                     </DropdownMenuGroup>
                     <DropdownMenuSeparator />
                  </>
               )}
               <DropdownMenuItem onClick={() => me && mark(me.id, 'skipped')}>
                  <CircleSlash />
                  Skip this time
               </DropdownMenuItem>
            </DropdownMenuContent>
         </DropdownMenu>
      </div>
   )
}

function PersonAvatar({ person }: { person: Member | undefined }) {
   return (
      <Avatar className='size-6' aria-hidden>
         {person && <AvatarImage src={avatarSrc(person)} alt='' />}
         <AvatarFallback className='bg-muted text-[0.5625rem] font-semibold text-foreground'>
            {person ? initials(person) : '?'}
         </AvatarFallback>
      </Avatar>
   )
}
