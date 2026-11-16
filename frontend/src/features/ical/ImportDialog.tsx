import { useId, useState } from 'react'
import { Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import FormAlert from '@/features/auth/FormAlert'
import type { CalendarKind } from '@/features/calendar/calendarApi'
import { ALL_KINDS, KINDS } from '@/features/calendar/kinds'
import { formatWhen, viewerTimeZone } from '@/features/calendar/time'
import { useImport, usePreviewImport, type PreviewEntry } from './icalApi'

const importable = (e: PreviewEntry) => !e.problem && !e.duplicate

/** Calendar: read an `.ics` file, show what's in it, import the ticked entries. */
export function ImportDialog({ householdId, onClose }: { householdId: string; onClose: () => void }) {
   const id = useId()
   const preview = usePreviewImport(householdId)
   const run = useImport(householdId)
   const [file, setFile] = useState<File | null>(null)
   const [kind, setKind] = useState<CalendarKind>('event')
   const [chosen, setChosen] = useState<Set<string>>(new Set())

   const read = (next: File | null, nextKind: CalendarKind) => {
      setFile(next)
      setKind(nextKind)
      if (!next) return preview.reset()
      preview.mutate(
         { file: next, kind: nextKind },
         { onSuccess: (entries) => setChosen(new Set(entries.filter(importable).map((e) => e.uid))) },
      )
   }

   const entries = preview.data ?? []
   const available = entries.filter(importable)
   const allChosen = available.length > 0 && available.every((e) => chosen.has(e.uid))
   const toggle = (uid: string, on: boolean) =>
      setChosen((prev) => {
         const next = new Set(prev)
         if (on) next.add(uid)
         else next.delete(uid)
         return next
      })
   const count = available.filter((e) => chosen.has(e.uid)).length
   const zone = viewerTimeZone()

   const submit = () => {
      if (!file || !count) return
      run.mutate(
         { file, kind, uids: [...chosen] },
         {
            onSuccess: ({ imported, skipped }) => {
               toast.success(
                  `Imported ${imported} ${imported === 1 ? 'entry' : 'entries'}${skipped ? ` (${skipped} skipped)` : ''}`,
               )
               onClose()
            },
         },
      )
   }

   return (
      <Dialog open onOpenChange={(next) => !next && !run.isPending && onClose()}>
         <DialogContent className='flex max-h-[92dvh] flex-col sm:max-w-lg'>
            <DialogHeader>
               <DialogTitle>Import a calendar file</DialogTitle>
               <DialogDescription>
                  Add entries from an .ics file, for example exported from Google Calendar, Outlook or Apple Calendar. You’ll see
                  them before anything is added.
               </DialogDescription>
            </DialogHeader>

            <div className='space-y-4'>
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-file`} className='text-sm font-medium'>
                     Calendar file
                  </label>
                  <Input
                     id={`${id}-file`}
                     type='file'
                     accept='.ics,text/calendar'
                     className='h-10 py-1.5'
                     disabled={run.isPending}
                     onChange={(e) => read(e.currentTarget.files?.[0] ?? null, kind)}
                  />
               </div>
               <div className='space-y-1.5'>
                  <span id={`${id}-kind`} className='text-sm font-medium'>
                     Add them as
                  </span>
                  <RadioGroup
                     value={kind}
                     aria-labelledby={`${id}-kind`}
                     className='grid-cols-2 gap-1 sm:grid-cols-4'
                     disabled={run.isPending}
                     onValueChange={(value) => read(file, value as CalendarKind)}
                  >
                     {ALL_KINDS.map((k) => (
                        <label key={k} className='flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm hover:bg-muted'>
                           <RadioGroupItem value={k} />
                           {KINDS[k].label}
                        </label>
                     ))}
                  </RadioGroup>
               </div>
            </div>

            {preview.isError && <FormAlert tone='error' error={apiError(preview.error)} />}
            {run.isError && <FormAlert tone='error' error={apiError(run.error)} />}
            <p role='status' className='sr-only'>
               {preview.isPending ? 'Reading the file…' : preview.isSuccess ? `${entries.length} entries found, ${available.length} can be imported.` : ''}
            </p>

            {preview.isPending && <div className='h-24 animate-pulse rounded-xl bg-muted' />}
            {preview.isSuccess && (
               <div className='flex min-h-0 flex-1 flex-col gap-2'>
                  <label className='flex items-center gap-3 px-1 text-sm font-medium has-data-disabled:cursor-default'>
                     <Checkbox
                        checked={allChosen}
                        indeterminate={!allChosen && count > 0}
                        disabled={!available.length || run.isPending}
                        onCheckedChange={(on) => setChosen(new Set(on ? available.map((e) => e.uid) : []))}
                     />
                     {available.length ? `All ${available.length} that can be imported` : 'Nothing new to import'}
                     {entries.length > available.length && (
                        <span className='font-normal text-muted-foreground'>({entries.length} in the file)</span>
                     )}
                  </label>
                  <ul className='scrollbar-slim min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border' aria-label='Entries in the file'>
                     {entries.map((e, i) => {
                        const reason = e.duplicate ? 'Already imported.' : e.problem
                        return (
                           <li key={`${e.uid}-${i}`}>
                              <label className='flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm has-data-disabled:cursor-default'>
                                 <Checkbox
                                    className='mt-0.5'
                                    checked={!reason && chosen.has(e.uid)}
                                    disabled={Boolean(reason) || run.isPending}
                                    onCheckedChange={(on) => toggle(e.uid, on)}
                                 />
                                 <span className='min-w-0'>
                                    <span className='flex items-center gap-1.5 font-medium wrap-break-word'>
                                       {e.title}
                                       {e.repeats && <Repeat className='size-3.5 shrink-0 text-muted-foreground' aria-label='repeats' />}
                                    </span>
                                    <span className='block text-muted-foreground'>
                                       {e.start ? formatWhen(e.start, e.end, e.allDay) : 'No date'}
                                       {!e.allDay && e.timezone !== zone && ` (${e.timezone.replaceAll('_', ' ')})`}
                                    </span>
                                    {reason && <span className='block text-muted-foreground italic'>{reason}</span>}
                                 </span>
                              </label>
                           </li>
                        )
                     })}
                  </ul>
               </div>
            )}

            <DialogFooter>
               <Button variant='outline' size='lg' className='px-4' disabled={run.isPending} onClick={onClose}>
                  Cancel
               </Button>
               <Button size='lg' className='px-4' disabled={!count || run.isPending || preview.isPending} onClick={submit}>
                  {run.isPending ? 'Importing…' : count ? `Import ${count} ${count === 1 ? 'entry' : 'entries'}` : 'Import'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
