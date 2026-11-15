import { useId, useState } from 'react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import type { Member } from '@/features/households/householdsApi'
import { useChangeOccurrence, type CalendarInstance, type OccurrenceChange, type Scope } from './calendarApi'
import { MemberPicker } from './MemberPicker'
import { ScopeDialog } from './ScopeDialog'
import { addDays, instantToParts, partsToInstant, viewerTimeZone, type LocalParts } from './time'

type ChangeOccurrenceDialogProps = {
   householdId: string
   instance: CalendarInstance | null
   members: Member[]
   onClose: () => void
}

/** Move/resize/reassign one occurrence with inputs: the non-drag way (WCAG 2.5.7). */
export function ChangeOccurrenceDialog({ householdId, instance, members, onClose }: ChangeOccurrenceDialogProps) {
   if (!instance) return null
   return <ChangeForm key={instance.id} householdId={householdId} instance={instance} members={members} onClose={onClose} />
}

function ChangeForm({ householdId, instance, members, onClose }: ChangeOccurrenceDialogProps & { instance: CalendarInstance }) {
   const id = useId()
   const zone = viewerTimeZone()
   const change = useChangeOccurrence(householdId)
   const initial = (iso: string, isEnd: boolean): LocalParts =>
      instance.allDay ? { date: isEnd ? addDays(iso, -1) : iso, time: '' } : instantToParts(iso, zone)
   const [start, setStart] = useState(() => initial(instance.start, false))
   const [end, setEnd] = useState(() => initial(instance.end, true))
   const [memberIds, setMemberIds] = useState(instance.memberIds)
   const [error, setError] = useState<string | null>(null)
   const [pending, setPending] = useState<OccurrenceChange | null>(null)

   const build = (): OccurrenceChange | null => {
      if (!start.date || !end.date || (!instance.allDay && (!start.time || !end.time))) {
         setError('Pick a date and time for start and end.')
         return null
      }
      const body: OccurrenceChange = instance.allDay
         ? { start: start.date, end: addDays(end.date, 1) }
         : { start: partsToInstant(start, zone), end: partsToInstant(end, zone) }
      const ok = instance.allDay ? end.date >= start.date : Date.parse(body.end ?? '') > Date.parse(body.start ?? '')
      if (!ok) {
         setError('End must be after the start.')
         return null
      }
      setError(null)
      const sameMembers = memberIds.length === instance.memberIds.length && memberIds.every((m) => instance.memberIds.includes(m))
      return sameMembers ? body : { ...body, memberIds }
   }

   const send = (body: OccurrenceChange, scope: Scope) =>
      change.mutate(
         { ref: { itemId: instance.itemId, originalStart: instance.originalStart }, scope, change: body },
         {
            onSuccess: () => {
               toast.success('Saved')
               setPending(null)
               onClose()
            },
            onError: () => setPending(null),
         },
      )

   const field = (which: 'start' | 'end', value: LocalParts, set: (v: LocalParts) => void) => (
      <fieldset className='space-y-1.5'>
         <legend className='text-sm font-medium'>{which === 'start' ? 'Starts' : 'Ends'}</legend>
         <div className='flex gap-2'>
            <Input
               type='date'
               aria-label={`${which === 'start' ? 'Start' : 'End'} date`}
               className='h-10 min-w-0 flex-1'
               value={value.date}
               onChange={(e) => set({ ...value, date: e.target.value })}
            />
            {!instance.allDay && (
               <Input
                  type='time'
                  aria-label={`${which === 'start' ? 'Start' : 'End'} time`}
                  className='h-10 w-28'
                  value={value.time}
                  onChange={(e) => set({ ...value, time: e.target.value })}
               />
            )}
         </div>
      </fieldset>
   )

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='max-h-[92dvh] overflow-y-auto sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>{instance.recurring ? 'Change this occurrence' : `Move “${instance.title}”`}</DialogTitle>
               <DialogDescription>{instance.title}</DialogDescription>
            </DialogHeader>
            <form
               noValidate
               className='space-y-4'
               onSubmit={(e) => {
                  e.preventDefault()
                  const body = build()
                  if (!body) return
                  if (instance.recurring) setPending(body)
                  else send(body, 'this')
               }}
            >
               {change.isError && <FormAlert tone='error' error={apiError(change.error)} />}
               <div className='grid grid-cols-1 gap-3'>
                  {field('start', start, setStart)}
                  {field('end', end, setEnd)}
               </div>
               {error && <FieldError>{error}</FieldError>}
               <div className='space-y-1.5'>
                  <span id={`${id}-people`} className='text-sm font-medium'>
                     Who
                  </span>
                  <MemberPicker labelId={`${id}-people`} members={members} value={memberIds} onChange={setMemberIds} />
               </div>
               <div className='flex justify-end border-t pt-4'>
                  <Button type='submit' size='lg' className='px-4' disabled={change.isPending}>
                     {change.isPending ? 'Saving…' : 'Save'}
                  </Button>
               </div>
            </form>
            <ScopeDialog
               open={pending !== null}
               title='Apply to which occurrences?'
               scopes={['this', 'following', 'all']}
               confirmLabel='Save'
               isPending={change.isPending}
               onCancel={() => setPending(null)}
               onConfirm={(scope) => pending && send(pending, scope)}
            />
         </DialogContent>
      </Dialog>
   )
}
