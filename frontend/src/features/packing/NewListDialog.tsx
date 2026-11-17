import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import { MemberPicker } from '@/features/calendar/MemberPicker'
import { selectClass } from '@/features/calendar/styles'
import type { Member } from '@/features/households/householdsApi'
import { cn } from '@/lib/utils'
import { MAX_TRIP_DAYS } from './amounts'
import { useCreateList, useTemplates } from './packingApi'

type Initial = { name: string; travellerIds: string[]; vacationId: string | null; days: number | null }

/** Start a packing list (optionally from a template); opens it when created. */
export function NewListDialog({
   householdId,
   members,
   initial = { name: '', travellerIds: [], vacationId: null, days: null },
   onClose,
}: {
   householdId: string
   members: Member[]
   initial?: Initial
   onClose: () => void
}) {
   const id = useId()
   const navigate = useNavigate()
   const templates = useTemplates(householdId)
   const create = useCreateList(householdId)
   const [name, setName] = useState(initial.name)
   const [templateId, setTemplateId] = useState('')
   const [travellerIds, setTravellerIds] = useState(initial.travellerIds)
   const [daysText, setDaysText] = useState(initial.days === null ? '' : String(initial.days))
   // Empty = unknown (null); undefined = not valid.
   const days = daysText.trim() === '' ? null : /^\d+$/.test(daysText.trim()) && Number(daysText) >= 1 && Number(daysText) <= MAX_TRIP_DAYS ? Number(daysText) : undefined
   const chosen = templates.data?.find((t) => t.id === templateId)
   const perDayItems = chosen?.items.filter((i) => i.perDay).length ?? 0

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!name.trim() || days === undefined) return
      create.mutate(
         { name: name.trim(), templateId: templateId || null, vacationId: initial.vacationId, travellerIds, days },
         {
            onSuccess: (list) => {
               onClose()
               void navigate(`/packing/${list.id}`)
            },
         },
      )
   }

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>New packing list</DialogTitle>
               <DialogDescription>
                  {initial.vacationId ? 'For this vacation. ' : ''}Items “for each person” are added once per traveller.
               </DialogDescription>
            </DialogHeader>
            <form id={`${id}-form`} onSubmit={submit} noValidate className='space-y-4'>
               {create.isError && <FormAlert tone='error' error={apiError(create.error)} />}
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-name`} className='text-sm font-medium'>
                     Name
                  </label>
                  <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder='e.g. Italy in July' autoFocus />
               </div>
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-template`} className='text-sm font-medium'>
                     Start from
                  </label>
                  <select
                     id={`${id}-template`}
                     className={cn(selectClass, 'w-full')}
                     value={templateId}
                     onChange={(e) => setTemplateId(e.target.value)}
                     disabled={!templates.data}
                     aria-describedby={`${id}-template-hint`}
                  >
                     <option value=''>An empty list</option>
                     {templates.data?.map((t) => (
                        <option key={t.id} value={t.id}>
                           {t.name} ({t.items.length} items)
                        </option>
                     ))}
                  </select>
                  <p id={`${id}-template-hint`} className='text-xs text-muted-foreground'>
                     {templates.isError
                        ? `Couldn’t load the templates: ${apiError(templates.error).message}`
                        : chosen
                          ? `${chosen.items.filter((i) => i.perPerson).length} of its items are for each person.`
                          : 'You can add items as you go.'}
                  </p>
               </div>
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-days`} className='text-sm font-medium'>
                     Days
                  </label>
                  <Input
                     id={`${id}-days`}
                     inputMode='numeric'
                     value={daysText}
                     onChange={(e) => setDaysText(e.target.value)}
                     className='w-24'
                     placeholder='–'
                     aria-invalid={days === undefined || undefined}
                     aria-describedby={`${id}-days-hint`}
                  />
                  <p id={`${id}-days-hint`} className={cn('text-xs', days === undefined ? 'text-destructive' : 'text-muted-foreground')}>
                     {days === undefined
                        ? `Use a whole number from 1 to ${MAX_TRIP_DAYS}.`
                        : perDayItems
                          ? days === null
                             ? `${perDayItems} items count per day; without days they get no amount.`
                             : `${perDayItems} items count per day, e.g. socks for ${days} ${days === 1 ? 'day' : 'days'}.`
                          : initial.days !== null
                            ? 'From the vacation dates.'
                            : 'Optional; used for amounts per day.'}
                  </p>
               </div>
               <div className='space-y-1.5'>
                  <span id={`${id}-people`} className='block text-sm font-medium'>
                     Who’s going
                  </span>
                  <MemberPicker labelId={`${id}-people`} members={members} value={travellerIds} onChange={setTravellerIds} />
               </div>
            </form>
            <DialogFooter>
               <Button type='button' variant='ghost' onClick={onClose}>
                  Cancel
               </Button>
               <Button type='submit' form={`${id}-form`} size='lg' className='px-4' disabled={!name.trim() || days === undefined || create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create list'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
