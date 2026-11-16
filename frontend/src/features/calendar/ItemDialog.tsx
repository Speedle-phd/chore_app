import { useId, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import * as z from 'zod'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { TimePicker } from '@/components/ui/time-picker'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import FormAlert from '@/features/auth/FormAlert'
import { EMPTY_BIRTHDAY, fromParts, type BirthdayParts } from '@/features/households/birthday'
import { BirthdayField } from '@/features/households/BirthdayField'
import { cn } from '@/lib/utils'
import type { Member } from '@/features/households/householdsApi'
import {
   useCalendarItem,
   useDeleteItem,
   useSaveItem,
   type CalendarItem,
   type CalendarKind,
   type ItemInput,
} from './calendarApi'
import { KINDS } from './kinds'
import { MemberPicker } from './MemberPicker'
import { afterDaysOf, NO_REPEAT, repeatOf, toRrule, type Repeat } from './recurrence'
import { RecurrenceEditor } from './RecurrenceEditor'
import { ScopeDialog } from './ScopeDialog'
import { selectClass } from './styles'
import { addDays, joinLocal, splitLocal, viewerTimeZone, type LocalParts } from './time'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

const schema = z
   .object({
      kind: z.enum(['chore', 'event', 'birthday', 'vacation', 'meal']),
      title: z.string().trim().min(1, 'Enter a title.').max(120),
      allDay: z.boolean(),
      startDate: z.string().regex(DATE, 'Pick a date.'),
      startTime: z.string(),
      endDate: z.string().regex(DATE, 'Pick a date.'),
      endTime: z.string(),
      memberIds: z.array(z.string()),
      notes: z.string().max(2000),
      repeat: z.custom<Repeat | 'custom'>(),
      effort: z.number().int().min(1).max(5),
      assignmentMode: z.enum(['anyone', 'everyone']),
      rotation: z.boolean(),
      birthday: z.custom<BirthdayParts>(),
   })
   .superRefine((v, ctx) => {
      if (v.kind === 'birthday') {
         if (!fromParts(v.birthday)) {
            ctx.addIssue({ code: 'custom', path: ['birthday'], message: 'Pick the day and month (the year is optional).' })
         }
         return
      }
      if (!v.allDay) {
         if (!TIME.test(v.startTime)) ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'Pick a time.' })
         if (!TIME.test(v.endTime)) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Pick a time.' })
      }
      const start = v.allDay ? v.startDate : `${v.startDate}T${v.startTime}`
      const end = v.allDay ? v.endDate : `${v.endDate}T${v.endTime}`
      // All-day end dates here are inclusive (the last day), so equal is fine.
      if (v.allDay ? end < start : end <= start) {
         ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End must be after the start.' })
      }
      if (v.kind !== 'chore' && afterDaysOf(v.repeat)) {
         ctx.addIssue({ code: 'custom', path: ['repeat'], message: 'Only chores can repeat after they’re done.' })
      }
   })
type Values = z.infer<typeof schema>

/** What a new entry starts with (from the Add button or a selected range). */
export type Draft = { allDay: boolean; start: LocalParts; end: LocalParts; kind?: CalendarKind }

type ItemDialogProps = {
   householdId: string
   members: Member[]
   /** Edit this entry, or create from `draft`. */
   itemId: string | null
   draft: Draft | null
   canDelete: (createdBy: string) => boolean
   onClose: () => void
}

export function ItemDialog({ householdId, members, itemId, draft, canDelete, onClose }: ItemDialogProps) {
   const open = itemId !== null || draft !== null
   const item = useCalendarItem(householdId, itemId)
   const editing = itemId !== null

   return (
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='max-h-[94dvh] overflow-y-auto sm:max-w-lg md:max-w-3xl'>
            <DialogHeader>
               <DialogTitle>{editing ? 'Edit entry' : 'New entry'}</DialogTitle>
               <DialogDescription>
                  {editing && item.data?.rrule
                     ? 'Changes apply to every occurrence. To change one date, use “Change this occurrence”.'
                     : 'Shared with everyone in the household.'}
               </DialogDescription>
            </DialogHeader>
            {editing && item.isPending ? (
               <p className='py-8 text-center text-muted-foreground' role='status'>
                  Loading…
               </p>
            ) : editing && item.isError ? (
               <FormAlert tone='error' error={apiError(item.error)} />
            ) : (
               <ItemForm
                  key={itemId ?? 'new'}
                  householdId={householdId}
                  members={members}
                  item={editing ? (item.data ?? null) : null}
                  draft={draft}
                  canDelete={canDelete}
                  onDone={onClose}
               />
            )}
         </DialogContent>
      </Dialog>
   )
}

function initialValues(item: CalendarItem | null, draft: Draft | null): Values {
   if (item) {
      const start = splitLocal(item.start)
      const end = splitLocal(item.allDay ? addDays(item.end, -1) : item.end)
      return {
         kind: item.kind,
         title: item.title,
         allDay: item.allDay,
         startDate: start.date,
         startTime: item.allDay ? '09:00' : start.time,
         endDate: end.date,
         endTime: item.allDay ? '10:00' : end.time,
         memberIds: item.memberIds,
         notes: item.notes,
         repeat: repeatOf(item.rrule, item.afterDays, item.timezone),
         ...item.chore,
         birthday:
            item.kind === 'birthday'
               ? { day: String(Number(item.start.slice(8, 10))), month: String(Number(item.start.slice(5, 7))), year: item.birthYear ? String(item.birthYear) : '' }
               : EMPTY_BIRTHDAY,
      }
   }
   const d = draft ?? { allDay: false, start: { date: '', time: '09:00' }, end: { date: '', time: '10:00' } }
   return {
      kind: d.kind ?? 'chore',
      title: '',
      allDay: d.allDay,
      startDate: d.start.date,
      startTime: d.start.time,
      endDate: d.allDay ? addDays(d.end.date, -1) : d.end.date,
      endTime: d.end.time,
      memberIds: [],
      notes: '',
      repeat: repeatOf(null, null, viewerTimeZone()),
      effort: 1,
      assignmentMode: 'anyone',
      rotation: false,
      // A selected day prefills the birthday if the type is switched to Birthday.
      birthday: d.start.date
         ? { day: String(Number(d.start.date.slice(8, 10))), month: String(Number(d.start.date.slice(5, 7))), year: '' }
         : EMPTY_BIRTHDAY,
   }
}

/** Birthdays: all-day, yearly; with a year the start is the birth date (age = years since). */
function birthdayInput(v: Values, timezone: string): ItemInput {
   const stored = fromParts(v.birthday) as string
   const year = v.birthday.year ? Number(v.birthday.year) : null
   const monthDay = stored.slice(-5)
   // Without a year, start in 2000 (a leap year, so 29 February is valid).
   const start = `${year ?? 2000}-${monthDay}`
   return {
      kind: 'birthday',
      title: v.title,
      notes: v.notes,
      allDay: true,
      start,
      end: addDays(start, 1),
      timezone,
      memberIds: [],
      // 29 February: the last day of February, so it shows on the 28th in other years.
      rrule: monthDay === '02-29' ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'FREQ=YEARLY',
      afterDays: null,
      birthYear: year,
      chore: { effort: v.effort, assignmentMode: v.assignmentMode, rotation: false },
   }
}

type ItemFormProps = {
   householdId: string
   members: Member[]
   item: CalendarItem | null
   draft: Draft | null
   canDelete: (createdBy: string) => boolean
   onDone: () => void
}

function ItemForm({ householdId, members, item, draft, canDelete, onDone }: ItemFormProps) {
   const id = useId()
   const save = useSaveItem(householdId, item?.id ?? null)
   const remove = useDeleteItem(householdId)
   const [confirmDelete, setConfirmDelete] = useState(false)
   const timezone = item?.timezone ?? viewerTimeZone()
   const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initialValues(item, draft) })
   const [allDay, startDate, startTime, kind, memberIds, assignmentMode, rotation, repeat] = useWatch({
      control: form.control,
      name: ['allDay', 'startDate', 'startTime', 'kind', 'memberIds', 'assignmentMode', 'rotation', 'repeat'],
   })
   const isChore = kind === 'chore'
   const isBirthday = kind === 'birthday'
   const repeats = repeat === 'custom' || repeat.freq !== 'none'
   // Turns only make sense when it comes round again.
   const canRotate = repeats && assignmentMode === 'anyone' && memberIds.length > 1

   const submit = form.handleSubmit((v) => {
      if (v.kind === 'birthday') {
         save.mutate(birthdayInput(v, timezone), {
            onSuccess: () => {
               toast.success(item ? 'Birthday saved' : 'Birthday added')
               onDone()
            },
         })
         return
      }
      const input: ItemInput = {
         kind: v.kind,
         title: v.title,
         notes: v.notes,
         allDay: v.allDay,
         start: joinLocal({ date: v.startDate, time: v.startTime }, v.allDay),
         // The form shows the last day; the API wants the exclusive end.
         end: v.allDay ? addDays(v.endDate, 1) : joinLocal({ date: v.endDate, time: v.endTime }, false),
         timezone,
         memberIds: v.memberIds,
         rrule: v.repeat === 'custom' ? (item?.rrule ?? null) : toRrule(v.repeat, timezone),
         afterDays: v.kind === 'chore' ? afterDaysOf(v.repeat) : null,
         birthYear: null,
         chore: {
            effort: v.effort,
            assignmentMode: v.assignmentMode,
            rotation:
               v.rotation &&
               v.assignmentMode === 'anyone' &&
               v.memberIds.length > 1 &&
               (v.repeat === 'custom' || v.repeat.freq !== 'none'),
         },
      }
      save.mutate(input, {
         onSuccess: () => {
            toast.success(item ? 'Entry saved' : 'Entry added')
            onDone()
         },
      })
   })

   const mayDelete = item ? canDelete(item.createdBy) : false

   return (
      <form noValidate className='grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2' onSubmit={submit}>
         {save.isError && (
            <div className='md:col-span-2'>
               <FormAlert tone='error' error={apiError(save.error)} />
            </div>
         )}

         {/* Left: what and when */}
         <div className='space-y-5'>
            <Controller
               name='title'
               control={form.control}
               render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className='gap-1.5'>
                     <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
                     <Input
                        {...field}
                        id={`${id}-title`}
                        autoComplete='off'
                        placeholder='e.g. Take out the bins'
                        aria-invalid={fieldState.invalid}
                        className='h-10'
                     />
                     {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
               )}
            />

            <Controller
               name='kind'
               control={form.control}
               render={({ field }) => (
                  <fieldset>
                     <legend className='mb-1.5 text-sm font-medium'>Type</legend>
                     <RadioGroup
                        value={field.value}
                        onValueChange={(next) => {
                           field.onChange(next)
                           // Sensible defaults: birthdays are all-day and yearly, vacations all-day.
                           if (next === 'birthday' || next === 'vacation') form.setValue('allDay', true)
                           const current = form.getValues('repeat')
                           if (next === 'birthday' && current !== 'custom' && current.freq === 'none') {
                              form.setValue('repeat', { ...NO_REPEAT, freq: 'YEARLY' })
                           }
                        }}
                        className='grid grid-cols-2 gap-2'
                     >
                        {(Object.keys(KINDS) as CalendarKind[]).map((kind) => (
                           <label
                              key={kind}
                              className='flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-primary/10'
                           >
                              <RadioGroupItem value={kind} />
                              <span className='size-2.5 shrink-0 rounded-full' style={{ background: KINDS[kind].color }} aria-hidden />
                              {KINDS[kind].one}
                           </label>
                        ))}
                     </RadioGroup>
                  </fieldset>
               )}
            />

            {isBirthday ? (
               <Controller
                  name='birthday'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <BirthdayField value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
                  )}
               />
            ) : (
            <div className='space-y-2'>
               <div className='flex items-center justify-between'>
                  <span id={`${id}-when`} className='text-sm font-medium'>
                     When
                  </span>
                  <Controller
                     name='allDay'
                     control={form.control}
                     render={({ field }) => (
                        <label className='flex cursor-pointer items-center gap-2 text-sm'>
                           <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                           All day
                        </label>
                     )}
                  />
               </div>
               <div role='group' aria-labelledby={`${id}-when`} className='grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-2'>
                  {(['start', 'end'] as const).map((which) => (
                     <div key={which} className='contents'>
                        <span className='text-sm text-muted-foreground'>{which === 'start' ? 'Starts' : 'Ends'}</span>
                        <Controller
                           name={`${which}Date`}
                           control={form.control}
                           render={({ field, fieldState }) => (
                              <DatePicker
                                 value={field.value}
                                 onChange={field.onChange}
                                 aria-label={`${which === 'start' ? 'Start' : 'End'} date`}
                                 invalid={fieldState.invalid}
                                 className={cn(allDay && 'col-span-2')}
                              />
                           )}
                        />
                        {!allDay && (
                           <Controller
                              name={`${which}Time`}
                              control={form.control}
                              render={({ field, fieldState }) => (
                                 <TimePicker
                                    value={field.value}
                                    onChange={field.onChange}
                                    aria-label={`${which === 'start' ? 'Start' : 'End'} time`}
                                    invalid={fieldState.invalid}
                                    className='w-32'
                                 />
                              )}
                           />
                        )}
                     </div>
                  ))}
               </div>
               {form.formState.errors.endDate && <FieldError errors={[form.formState.errors.endDate]} />}
               {timezone !== viewerTimeZone() && (
                  <p className='text-xs text-muted-foreground'>Times are in {timezone.replace(/_/g, ' ')}.</p>
               )}
            </div>
            )}
         </div>

         {/* Right: repeat, people, notes */}
         <div className='space-y-5'>
            {!isBirthday && (
            <>
            <Controller
               name='repeat'
               control={form.control}
               render={({ field }) => (
                  <RecurrenceEditor
                     id={`${id}-repeat`}
                     value={field.value}
                     onChange={field.onChange}
                     start={joinLocal({ date: startDate || '2026-01-05', time: startTime }, allDay)}
                     defaultUntil={startDate ? addDays(startDate, 28) : ''}
                     allowAfterCompletion={isChore}
                  />
               )}
            />
            {form.formState.errors.repeat && <FieldError errors={[form.formState.errors.repeat]} />}

            <div className='space-y-1.5'>
               <span id={`${id}-people`} className='block text-sm font-medium'>
                  Who
               </span>
               <Controller
                  name='memberIds'
                  control={form.control}
                  render={({ field }) => (
                     <MemberPicker labelId={`${id}-people`} members={members} value={field.value} onChange={field.onChange} />
                  )}
               />
            </div>
            </>
            )}
            {isBirthday && (
               <p className='text-sm text-muted-foreground'>Repeats every year. With a year, the calendar shows the age.</p>
            )}

            {isChore && (
               <fieldset className='space-y-3 rounded-xl border bg-muted/30 p-3'>
                  <legend className='sr-only'>Chore settings</legend>
                  <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
                     <Controller
                        name='effort'
                        control={form.control}
                        render={({ field }) => (
                           <div className='flex items-center gap-2'>
                              <span id={`${id}-effort`} className='text-sm'>
                                 Effort
                              </span>
                              <RadioGroup
                                 aria-labelledby={`${id}-effort`}
                                 aria-describedby={`${id}-effort-hint`}
                                 value={String(field.value)}
                                 onValueChange={(v) => field.onChange(Number(v))}
                                 className='flex gap-1'
                              >
                                 {[1, 2, 3, 4, 5].map((n) => (
                                    <label
                                       key={n}
                                       className='relative grid size-8 cursor-pointer place-items-center rounded-lg border text-sm transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-primary has-data-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50'
                                    >
                                       <RadioGroupItem value={String(n)} aria-label={String(n)} className='absolute inset-0 size-full opacity-0' />
                                       {n}
                                    </label>
                                 ))}
                              </RadioGroup>
                              <span id={`${id}-effort-hint`} className='sr-only'>
                                 1 is a quick task, 5 a big job
                              </span>
                           </div>
                        )}
                     />
                     <Controller
                        name='assignmentMode'
                        control={form.control}
                        render={({ field }) => (
                           <label className='flex items-center gap-2 text-sm'>
                              Done by
                              <select
                                 className={cn(selectClass, 'w-auto')}
                                 value={field.value}
                                 onChange={(e) => field.onChange(e.target.value)}
                              >
                                 <option value='anyone'>any one of them</option>
                                 <option value='everyone'>each of them</option>
                              </select>
                           </label>
                        )}
                     />
                  </div>
                  <div className='space-y-1'>
                     <Controller
                        name='rotation'
                        control={form.control}
                        render={({ field }) => (
                           <label className={cn('flex w-fit cursor-pointer items-center gap-2 text-sm', !canRotate && 'text-muted-foreground')}>
                              <Checkbox
                                 checked={field.value && canRotate}
                                 onCheckedChange={field.onChange}
                                 disabled={!canRotate}
                                 aria-describedby={`${id}-turns`}
                              />
                              Take turns
                           </label>
                        )}
                     />
                     <p id={`${id}-turns`} className='text-xs text-muted-foreground'>
                        {canRotate
                           ? rotation
                              ? `Turns: ${memberIds.map((m) => members.find((x) => x.id === m)?.fname ?? '?').join(' → ')}`
                              : 'One person per date, in the order you picked them.'
                           : !repeats
                             ? 'Turns are for repeating chores: pick how it repeats first.'
                             : assignmentMode === 'everyone'
                               ? 'Not with “each of them”: everyone does it every time.'
                               : 'Pick at least two people to take turns.'}
                     </p>
                  </div>
               </fieldset>
            )}

            <Controller
               name='notes'
               control={form.control}
               render={({ field }) => (
                  <Field className='gap-1.5'>
                     <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
                     <Textarea {...field} id={`${id}-notes`} rows={2} className='max-h-32' />
                  </Field>
               )}
            />
         </div>

         <div className='flex flex-wrap items-center justify-between gap-2 border-t pt-4 md:col-span-2'>
            {item ? (
               <div>
                  <Button
                     type='button'
                     variant='ghost'
                     disabled={!mayDelete || remove.isPending}
                     aria-describedby={mayDelete ? undefined : `${id}-delete-hint`}
                     onClick={() => setConfirmDelete(true)}
                  >
                     <Trash2 className='text-destructive' />
                     Delete
                  </Button>
                  {!mayDelete && (
                     <p id={`${id}-delete-hint`} className='text-xs text-muted-foreground'>
                        Only who added it or an admin can delete it.
                     </p>
                  )}
               </div>
            ) : (
               <span />
            )}
            <Button type='submit' size='lg' className='px-4' disabled={save.isPending}>
               {save.isPending ? 'Saving…' : item ? 'Save changes' : 'Add entry'}
            </Button>
         </div>

         {item && (
            <ScopeDialog
               open={confirmDelete}
               title={`Delete “${item.title}”?`}
               description={item.rrule ? 'This deletes every occurrence.' : 'This can’t be undone.'}
               scopes={[]}
               confirmLabel='Delete'
               destructive
               isPending={remove.isPending}
               onCancel={() => setConfirmDelete(false)}
               onConfirm={() =>
                  remove.mutate(item.id, {
                     onSuccess: () => {
                        toast.success('Entry deleted')
                        setConfirmDelete(false)
                        onDone()
                     },
                     onError: (e) => toast.error(apiError(e).message),
                  })
               }
            />
         )}
      </form>
   )
}
