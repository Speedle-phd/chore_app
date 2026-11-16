import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import { selectClass } from '@/features/calendar/styles'
import { cn } from '@/lib/utils'
import { useAddItems, useDeleteItem, useUpdateItem, type ShoppingCategory, type ShoppingItem } from './shoppingApi'
import { parseQuantity, UNITS, type UnitId } from './units'

/** Edit one item: name, amount, unit, category (remembered for next time), note; or delete it (with Undo). */
export function ItemDialog({
   householdId,
   item,
   categories,
   onClose,
}: {
   householdId: string
   item: ShoppingItem
   categories: ShoppingCategory[]
   onClose: () => void
}) {
   const id = useId()
   const update = useUpdateItem(householdId, item.listId)
   const remove = useDeleteItem(householdId, item.listId)
   const restore = useAddItems(householdId, item.listId)
   const [name, setName] = useState(item.name)
   const [amount, setAmount] = useState(item.quantity === null ? '' : String(item.quantity))
   const [unit, setUnit] = useState<UnitId | ''>(item.unit ?? '')
   const [categoryId, setCategoryId] = useState(item.categoryId ?? '')
   const [note, setNote] = useState(item.note)
   const quantity = parseQuantity(amount)
   const valid = name.trim().length > 0 && quantity !== undefined

   const save = (e: React.FormEvent) => {
      e.preventDefault()
      if (!valid) return
      update.mutate(
         { id: item.id, change: { name: name.trim(), quantity, unit: unit || null, categoryId: categoryId || null, note: note.trim() } },
         { onSuccess: onClose },
      )
   }

   const del = () =>
      remove.mutate(item.id, {
         onSuccess: () => {
            onClose()
            toast.success(`Removed ${item.name}`, {
               action: {
                  label: 'Undo',
                  onClick: () =>
                     restore.mutate([
                        { name: item.name, quantity: item.quantity, unit: item.unit, note: item.note, categoryId: item.categoryId, checked: item.checked },
                     ]),
               },
            })
         },
         onError: (e) => toast.error(apiError(e).message),
      })

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>Edit item</DialogTitle>
               <DialogDescription>{item.name}</DialogDescription>
            </DialogHeader>
            <form id={`${id}-form`} onSubmit={save} noValidate className='space-y-4'>
               {update.isError && <FormAlert tone='error' error={apiError(update.error)} />}
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-name`} className='text-sm font-medium'>
                     What
                  </label>
                  <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-invalid={!name.trim()} />
               </div>
               <div className='grid grid-cols-2 gap-3'>
                  <div className='space-y-1.5'>
                     <label htmlFor={`${id}-amount`} className='text-sm font-medium'>
                        Amount
                     </label>
                     <Input
                        id={`${id}-amount`}
                        inputMode='decimal'
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        aria-invalid={quantity === undefined}
                        aria-describedby={quantity === undefined ? `${id}-amount-error` : undefined}
                     />
                  </div>
                  <div className='space-y-1.5'>
                     <label htmlFor={`${id}-unit`} className='text-sm font-medium'>
                        Unit
                     </label>
                     <select id={`${id}-unit`} className={cn(selectClass, 'w-full')} value={unit} onChange={(e) => setUnit(e.target.value as UnitId | '')}>
                        <option value=''>–</option>
                        {UNITS.map((u) => (
                           <option key={u.id} value={u.id}>
                              {u.label}
                           </option>
                        ))}
                     </select>
                  </div>
               </div>
               {quantity === undefined && (
                  <p id={`${id}-amount-error`} className='-mt-2 text-xs text-destructive'>
                     Use a number, like 2, 1,5 or ½.
                  </p>
               )}
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-category`} className='text-sm font-medium'>
                     Category
                  </label>
                  <select id={`${id}-category`} className={cn(selectClass, 'w-full')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                     <option value=''>No category</option>
                     {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                           {c.name}
                        </option>
                     ))}
                  </select>
                  <p className='text-xs text-muted-foreground'>Remembered for next time you add “{name.trim() || item.name}”.</p>
               </div>
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-note`} className='text-sm font-medium'>
                     Note
                  </label>
                  <Input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder='e.g. organic, the big pack' />
               </div>
            </form>
            <DialogFooter className='sm:justify-between'>
               <Button variant='ghost' onClick={del} disabled={remove.isPending}>
                  <Trash2 className='text-destructive' />
                  Delete
               </Button>
               <Button type='submit' form={`${id}-form`} size='lg' className='px-4' disabled={!valid || update.isPending}>
                  {update.isPending ? 'Saving…' : 'Save'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
