import { useId, useState } from 'react'
import { AlertTriangle, CalendarClock, Pencil, Repeat, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChoreActions } from '@/features/chores/ChoreActions'
import { ConflictNotice } from '@/features/chores/ConflictNotice'
import { EffortDots } from '@/features/chores/ChoreCard'
import type { Member, Role } from '@/features/households/householdsApi'
import { avatarSrc, initials } from '@/lib/member'
import {
   useCalendarItem,
   useDeleteItem,
   useDeleteOccurrence,
   type CalendarInstance,
   type Scope,
} from './calendarApi'
import { KINDS } from './kinds'
import { describeRepeat } from './recurrence'
import { ScopeDialog } from './ScopeDialog'
import { formatWhen } from './time'

type OccurrenceDialogProps = {
   householdId: string
   instance: CalendarInstance | null
   members: Member[]
   role: Role
   canDelete: (createdBy: string) => boolean
   onClose: () => void
   onEdit: (itemId: string) => void
   onChange: (instance: CalendarInstance) => void
}

/** Details of one occurrence with its actions (keyboard alternative to dragging). */
export function OccurrenceDialog({ householdId, instance, members, role, canDelete, onClose, onEdit, onChange }: OccurrenceDialogProps) {
   const item = useCalendarItem(householdId, instance?.recurring && instance.source === 'entry' ? instance.itemId : null)
   const removeItem = useDeleteItem(householdId)
   const removeOccurrence = useDeleteOccurrence(householdId)
   const [confirming, setConfirming] = useState(false)
   const hintId = useId()
   if (!instance) return null

   const people = instance.memberIds.map((id) => members.find((m) => m.id === id) ?? null)
   const mayDeleteSeries = canDelete(instance.createdBy)
   // After-completion chores have no fixed dates to skip: deleting removes the chore.
   const afterCompletion = Boolean(instance.chore?.afterDays)
   const ruleSeries = instance.recurring && !afterCompletion
   const scopes: Scope[] = ruleSeries ? (mayDeleteSeries ? ['this', 'following'] : ['this']) : []
   const deletable = ruleSeries || mayDeleteSeries
   const settledHistory = afterCompletion && (instance.chore?.state === 'done' || instance.chore?.state === 'skipped')
   const pending = removeItem.isPending || removeOccurrence.isPending
   const done = () => {
      toast.success('Deleted')
      setConfirming(false)
      onClose()
   }
   const failed = (e: unknown) => toast.error(apiError(e).message)

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <span className='flex items-center gap-2 text-xs font-medium text-muted-foreground'>
                  <span className='size-2.5 rounded-full' style={{ background: KINDS[instance.kind].color }} aria-hidden />
                  {KINDS[instance.kind].one}
               </span>
               <DialogTitle className='text-lg'>{instance.title}</DialogTitle>
               <DialogDescription className='sr-only'>Details and actions for this entry</DialogDescription>
            </DialogHeader>

            <dl className='space-y-2.5 text-sm'>
               <div className='flex gap-3'>
                  <dt className='shrink-0'>
                     <CalendarClock className='size-4 text-muted-foreground' aria-label='When' />
                  </dt>
                  <dd>
                     {formatWhen(instance.start, instance.end, instance.allDay)}
                     {instance.overridden && <span className='text-muted-foreground'> · changed for this date</span>}
                     {instance.kind === 'birthday' && instance.age !== null && <span> · turns {instance.age}</span>}
                  </dd>
               </div>
               {instance.recurring && (
                  <div className='flex gap-3'>
                     <dt className='shrink-0'>
                        <Repeat className='size-4 text-muted-foreground' aria-label='Repeats' />
                     </dt>
                     <dd>
                        {instance.source === 'member'
                           ? 'Every year'
                           : item.data
                             ? describeRepeat(item.data.rrule, item.data.timezone, item.data.afterDays)
                             : 'Repeats'}
                     </dd>
                  </div>
               )}
               <div className='flex gap-3'>
                  <dt className='shrink-0 pt-1.5'>
                     <Users className='size-4 text-muted-foreground' aria-label='Who' />
                  </dt>
                  <dd className='min-w-0 flex-1'>
                     {people.length ? (
                        <ul className='flex flex-wrap gap-x-4 gap-y-2'>
                           {people.map((p, i) => (
                              <li key={p?.id ?? i} className='flex items-center gap-2'>
                                 <Avatar className='size-7' aria-hidden>
                                    {p && <AvatarImage src={avatarSrc(p)} alt='' />}
                                    <AvatarFallback className='bg-muted text-[0.65rem] font-semibold text-foreground'>
                                       {p ? initials(p) : '?'}
                                    </AvatarFallback>
                                 </Avatar>
                                 {p ? p.fullName : <span className='italic'>Former member</span>}
                              </li>
                           ))}
                        </ul>
                     ) : (
                        <span className='text-muted-foreground'>Nobody assigned</span>
                     )}
                  </dd>
               </div>
               {instance.notes && <p className='rounded-lg bg-muted/50 p-3 whitespace-pre-wrap'>{instance.notes}</p>}
            </dl>

            {instance.chore && (
               <section aria-label='Chore status' className='space-y-2 rounded-xl border bg-muted/30 p-3'>
                  <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
                     <span className='font-medium'>
                        {instance.chore.assignmentMode === 'everyone' && instance.memberIds.length > 0
                           ? 'Everyone does their part'
                           : instance.chore.rotation
                             ? 'Their turn'
                             : 'Any one of them'}
                     </span>
                     <EffortDots effort={instance.chore.effort} />
                     {instance.chore.overdue && (
                        <span className='flex items-center gap-1 font-medium'>
                           <AlertTriangle className='size-3.5 text-destructive' aria-hidden />
                           Overdue
                        </span>
                     )}
                  </div>
                  {instance.chore.conflict && (
                     <ConflictNotice
                        householdId={householdId}
                        instance={{ ...instance, chore: { ...instance.chore, conflict: instance.chore.conflict } }}
                        members={members}
                     />
                  )}
                  <ChoreActions
                     householdId={householdId}
                     instance={{ ...instance, chore: instance.chore }}
                     members={members}
                     role={role}
                     variant='full'
                  />
               </section>
            )}

            {instance.source === 'member' && (
               <p className='rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground'>
                  From {people[0]?.fname ?? 'a member'}’s profile. Change it on the Members page (profiles) or in Account (your own).
               </p>
            )}

            {instance.source === 'entry' && (
            <div className='flex flex-wrap gap-2 border-t pt-4'>
               <Button variant='outline' onClick={() => onEdit(instance.itemId)}>
                  <Pencil />
                  Edit {instance.recurring ? 'series' : 'entry'}
               </Button>
               {!settledHistory && (
                  <Button variant='outline' onClick={() => onChange(instance)}>
                     <CalendarClock />
                     {ruleSeries ? 'Change this occurrence' : 'Move'}
                  </Button>
               )}
               <Button
                  variant='ghost'
                  disabled={!deletable || pending}
                  aria-describedby={deletable ? undefined : hintId}
                  onClick={() => setConfirming(true)}
               >
                  <Trash2 className='text-destructive' />
                  Delete
               </Button>
            </div>
            )}
            {instance.source === 'entry' && !deletable && <p id={hintId} className='-mt-2 text-xs text-muted-foreground'>Only who added it or an admin can delete it.</p>}

            <ScopeDialog
               open={confirming}
               title={ruleSeries ? 'Delete which occurrences?' : `Delete “${instance.title}”?`}
               description={ruleSeries ? undefined : afterCompletion ? 'This deletes the chore and its history.' : 'This can’t be undone.'}
               scopes={scopes}
               confirmLabel='Delete'
               destructive
               isPending={pending}
               onCancel={() => setConfirming(false)}
               onConfirm={(scope) => {
                  const ref = { itemId: instance.itemId, originalStart: instance.originalStart }
                  if (!ruleSeries) removeItem.mutate(instance.itemId, { onSuccess: done, onError: failed })
                  else
                     removeOccurrence.mutate(
                        { ref, scope: scope === 'all' ? 'following' : scope },
                        { onSuccess: done, onError: failed },
                     )
               }}
            />
         </DialogContent>
      </Dialog>
   )
}
