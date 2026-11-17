import { useId, useState } from 'react'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import { selectClass } from '@/features/calendar/styles'
import { cn } from '@/lib/utils'
import { parseAmount } from './amounts'
import { useUpdatePackingItem, type PackingItem } from './packingApi'
import { SECTION_IDS, SECTIONS, type PackingSection } from './sections'

/** Change one item: what, how many, section and whose. */
export function ItemDialog({
   householdId,
   listId,
   item,
   people,
   nameOf,
   onClose,
}: {
   householdId: string
   listId: string
   item: PackingItem
   people: string[]
   nameOf: (id: string) => string
   onClose: () => void
}) {
   const id = useId()
   const update = useUpdatePackingItem(householdId, listId)
   const [text, setText] = useState(item.text)
   const [amount, setAmount] = useState(item.quantity === null ? '' : String(item.quantity))
   const [section, setSection] = useState<PackingSection>(item.section)
   const [memberId, setMemberId] = useState(item.memberId ?? '')
   const quantity = parseAmount(amount)
   const valid = text.trim().length > 0 && quantity !== undefined
   // Someone who left keeps their items; they stay choosable for this one.
   const choices = item.memberId && !people.includes(item.memberId) ? [...people, item.memberId] : people

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!valid) return
      update.mutate(
         { id: item.id, change: { text: text.trim(), quantity, section, memberId: memberId || null } },
         { onSuccess: onClose },
      )
   }

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>Edit item</DialogTitle>
               <DialogDescription>{item.text}</DialogDescription>
            </DialogHeader>
            <form id={`${id}-form`} onSubmit={submit} noValidate className='space-y-4'>
               {update.isError && <FormAlert tone='error' error={apiError(update.error)} />}
               <div className='grid grid-cols-[minmax(0,1fr)_5rem] gap-3'>
                  <div className='space-y-1.5'>
                     <label htmlFor={`${id}-text`} className='text-sm font-medium'>
                        What
                     </label>
                     <Input id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} maxLength={100} aria-invalid={!text.trim() || undefined} />
                  </div>
                  <div className='space-y-1.5'>
                     <label htmlFor={`${id}-amount`} className='text-sm font-medium'>
                        Amount
                     </label>
                     <Input
                        id={`${id}-amount`}
                        inputMode='numeric'
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder='–'
                        className='text-center'
                        aria-invalid={quantity === undefined || undefined}
                        aria-describedby={`${id}-amount-hint`}
                     />
                  </div>
               </div>
               <p id={`${id}-amount-hint`} className={cn('-mt-2 text-xs', quantity === undefined ? 'text-destructive' : 'text-muted-foreground')}>
                  {quantity === undefined ? 'Use a whole number from 1 to 99, or leave it empty.' : 'Leave the amount empty when a count doesn’t matter.'}
               </p>
               <div className='grid grid-cols-2 gap-3'>
                  <div className='space-y-1.5'>
                     <label htmlFor={`${id}-section`} className='text-sm font-medium'>
                        Section
                     </label>
                     <select id={`${id}-section`} className={cn(selectClass, 'w-full')} value={section} onChange={(e) => setSection(e.target.value as PackingSection)}>
                        {SECTION_IDS.map((s) => (
                           <option key={s} value={s}>
                              {SECTIONS[s].label}
                           </option>
                        ))}
                     </select>
                  </div>
                  <div className='space-y-1.5'>
                     <label htmlFor={`${id}-who`} className='text-sm font-medium'>
                        For
                     </label>
                     <select id={`${id}-who`} className={cn(selectClass, 'w-full')} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                        <option value=''>Shared</option>
                        {choices.map((p) => (
                           <option key={p} value={p}>
                              {nameOf(p)}
                           </option>
                        ))}
                     </select>
                  </div>
               </div>
            </form>
            <DialogFooter>
               <Button type='button' variant='ghost' onClick={onClose}>
                  Cancel
               </Button>
               <Button type='submit' form={`${id}-form`} size='lg' className='px-4' disabled={!valid || update.isPending}>
                  {update.isPending ? 'Saving…' : 'Save'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
