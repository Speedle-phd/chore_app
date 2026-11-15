import { BellOff, Cake, CalendarDays, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { dayLabel } from '@/features/chores/format'
import { formatWhen } from '@/features/calendar/time'
import { Temporal } from 'temporal-polyfill'
import { RemindMe } from './RemindMe'
import { leadText, useDeleteReminder, useReminders, useUpcomingReminders } from './remindersApi'

/** Settings: your reminders in this household, "all birthdays", and what's coming up. */
export function RemindersSection({ householdId }: { householdId: string }) {
   const reminders = useReminders(householdId)
   const upcoming = useUpcomingReminders(householdId)
   const remove = useDeleteReminder(householdId)
   const today = Temporal.Now.plainDateISO().toString()
   const specific = (reminders.data ?? []).filter((r) => r.target.type !== 'allBirthdays')

   return (
      <div className='space-y-6'>
         <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4'>
            <div className='flex items-center gap-3'>
               <Cake className='size-5 text-muted-foreground' aria-hidden />
               <div>
                  <p className='text-sm font-medium'>Every birthday in this household</p>
                  <p className='text-sm text-muted-foreground'>Members’ and the ones added to the calendar.</p>
               </div>
            </div>
            <RemindMe householdId={householdId} target={{ type: 'allBirthdays' }} about='all birthdays' size='sm' />
         </div>

         <div className='space-y-2'>
            <h3 className='text-sm font-medium'>Single reminders</h3>
            {reminders.isPending ? (
               <div className='h-12 animate-pulse rounded-xl bg-muted' />
            ) : specific.length === 0 ? (
               <p className='text-sm text-muted-foreground'>
                  None yet. Open a birthday or event in the calendar and choose “Remind me”.
               </p>
            ) : (
               <ul className='divide-y rounded-xl border'>
                  {specific.map((r) => (
                     <li key={r.id} className='flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm'>
                        <span>
                           <span className='font-medium'>{r.label}</span>
                           <span className='text-muted-foreground'> · {leadText(r.leadDays)}</span>
                        </span>
                        <Button
                           variant='ghost'
                           size='sm'
                           aria-label={`Remove reminder for ${r.label}`}
                           disabled={remove.isPending}
                           onClick={() =>
                              remove.mutate(r.id, {
                                 onSuccess: () => toast.success('Reminder removed'),
                                 onError: (e) => toast.error(apiError(e).message),
                              })
                           }
                        >
                           <Trash2 className='text-destructive' />
                           Remove
                        </Button>
                     </li>
                  ))}
               </ul>
            )}
         </div>

         <div className='space-y-2'>
            <h3 className='text-sm font-medium'>Coming up in the next 30 days</h3>
            <p className='text-xs text-muted-foreground'>
               What your reminders will send. E-mail delivery starts with a later update; until then this is a preview.
            </p>
            {upcoming.isPending ? (
               <div className='h-12 animate-pulse rounded-xl bg-muted' />
            ) : !upcoming.data?.length ? (
               <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <BellOff className='size-4' aria-hidden />
                  Nothing in the next 30 days.
               </p>
            ) : (
               <ul className='space-y-1.5'>
                  {upcoming.data.map((u) => (
                     <li key={`${u.sendOn}-${u.date}-${u.title}-${u.leadDays}`} className='flex items-start gap-3 text-sm'>
                        <span className='w-24 shrink-0 font-medium'>{dayLabel(u.sendOn, today)}</span>
                        <span className='flex min-w-0 items-start gap-1.5'>
                           {u.kind === 'birthday' ? (
                              <Cake className='mt-0.5 size-3.5 shrink-0 text-muted-foreground' aria-hidden />
                           ) : (
                              <CalendarDays className='mt-0.5 size-3.5 shrink-0 text-muted-foreground' aria-hidden />
                           )}
                           <span>
                              {u.title}
                              {u.age !== null && !u.title.includes(String(u.age)) && ` (${u.age})`}
                              <span className='text-muted-foreground'>
                                 {' · '}
                                 {u.leadDays === 0
                                    ? 'on the day'
                                    : `in ${u.leadDays} ${u.leadDays === 1 ? 'day' : 'days'}, ${formatWhen(u.start, addDay(u.start, u.allDay), u.allDay)}`}
                              </span>
                           </span>
                        </span>
                     </li>
                  ))}
               </ul>
            )}
         </div>
      </div>
   )
}

/** End for formatWhen of an all-day date (exclusive), or the same instant for timed. */
const addDay = (start: string, allDay: boolean) =>
   allDay ? Temporal.PlainDate.from(start).add({ days: 1 }).toString() : start
