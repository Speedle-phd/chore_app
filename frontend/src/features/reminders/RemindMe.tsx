import { useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
   LEAD_OPTIONS,
   leadText,
   sameTarget,
   useDeleteReminder,
   useReminders,
   useSaveReminder,
   type ReminderTarget,
} from './remindersApi'

type RemindMeProps = {
   householdId: string
   target: ReminderTarget
   /** What it is about, for the button and dialog ("Oma", "all birthdays"). */
   about: string
   size?: 'sm' | 'default'
}

/** "Remind me" for one target: pick when (on the day, day before, a week before), or stop. */
export function RemindMe({ householdId, target, about, size = 'default' }: RemindMeProps) {
   const reminders = useReminders(householdId)
   const save = useSaveReminder(householdId)
   const remove = useDeleteReminder(householdId)
   const existing = reminders.data?.find((r) => sameTarget(r.target, target))
   const [open, setOpen] = useState(false)
   const [picked, setPicked] = useState<number[]>([])
   const busy = save.isPending || remove.isPending

   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            if (next) setPicked(existing?.leadDays ?? [0])
            setOpen(next)
         }}
      >
         <PopoverTrigger
            render={
               <Button variant={existing ? 'secondary' : 'outline'} size={size === 'sm' ? 'sm' : 'default'} disabled={reminders.isPending}>
                  {existing ? <BellRing /> : <Bell />}
                  {existing ? `Reminding you: ${leadText(existing.leadDays)}` : 'Remind me'}
               </Button>
            }
         />
         <PopoverContent className='w-64 space-y-3' aria-label={`Remind me about ${about}`}>
            <fieldset className='space-y-2'>
               <legend className='mb-1 text-sm font-medium'>Remind me about {about}</legend>
               {LEAD_OPTIONS.map((o) => (
                  <label key={o.days} className='flex cursor-pointer items-center gap-2 text-sm'>
                     <Checkbox
                        checked={picked.includes(o.days)}
                        onCheckedChange={(on) => setPicked((p) => (on ? [...p, o.days] : p.filter((d) => d !== o.days)))}
                     />
                     {o.label}
                  </label>
               ))}
            </fieldset>
            <p className='text-xs text-muted-foreground'>By e-mail to your account address (sending starts with a later update).</p>
            <div className='flex flex-wrap justify-end gap-2 border-t pt-3'>
               {existing && (
                  <Button
                     variant='ghost'
                     size='sm'
                     disabled={busy}
                     onClick={() =>
                        remove.mutate(existing.id, {
                           onSuccess: () => {
                              toast.success('Reminder removed')
                              setOpen(false)
                           },
                           onError: (e) => toast.error(apiError(e).message),
                        })
                     }
                  >
                     Stop reminding
                  </Button>
               )}
               <Button
                  size='sm'
                  disabled={busy || picked.length === 0}
                  onClick={() =>
                     save.mutate(
                        { target, leadDays: picked },
                        {
                           onSuccess: () => {
                              toast.success('Reminder saved')
                              setOpen(false)
                           },
                           onError: (e) => toast.error(apiError(e).message),
                        },
                     )
                  }
               >
                  Save
               </Button>
            </div>
         </PopoverContent>
      </Popover>
   )
}
