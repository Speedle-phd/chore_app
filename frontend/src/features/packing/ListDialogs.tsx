import { useId, useState } from 'react'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import { selectClass } from '@/features/calendar/styles'
import { useShoppingLists } from '@/features/shopping/shoppingApi'
import { cn } from '@/lib/utils'

/** Ask for a name (rename a list, save it as a template). */
export function NameDialog({
   title,
   description,
   initial,
   submitLabel,
   isPending,
   error,
   onSubmit,
   onClose,
}: {
   title: string
   description: string
   initial: string
   submitLabel: string
   isPending: boolean
   error: unknown
   onSubmit: (name: string) => void
   onClose: () => void
}) {
   const id = useId()
   const [name, setName] = useState(initial)
   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-sm'>
            <DialogHeader>
               <DialogTitle>{title}</DialogTitle>
               <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <form
               id={`${id}-form`}
               noValidate
               className='space-y-3'
               onSubmit={(e) => {
                  e.preventDefault()
                  if (name.trim()) onSubmit(name.trim())
               }}
            >
               {error ? <FormAlert tone='error' error={apiError(error)} /> : null}
               <label htmlFor={`${id}-name`} className='text-sm font-medium'>
                  Name
               </label>
               <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
            </form>
            <DialogFooter>
               <Button type='button' variant='ghost' onClick={onClose}>
                  Cancel
               </Button>
               <Button type='submit' form={`${id}-form`} disabled={!name.trim() || isPending}>
                  {submitLabel}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}

/** Pick the shopping list that gets the unpacked items. */
export function ToShoppingDialog({
   householdId,
   count,
   isPending,
   error,
   onSubmit,
   onClose,
}: {
   householdId: string
   count: number
   isPending: boolean
   error: unknown
   onSubmit: (shoppingListId: string) => void
   onClose: () => void
}) {
   const id = useId()
   const lists = useShoppingLists(householdId)
   const [picked, setPicked] = useState('')
   const listId = picked || lists.data?.[0]?.id || ''
   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-sm'>
            <DialogHeader>
               <DialogTitle>Add to shopping list</DialogTitle>
               <DialogDescription>
                  {count === 1 ? 'The 1 item not packed yet' : `The ${count} items not packed yet`} go onto the shopping list (same things counted together).
               </DialogDescription>
            </DialogHeader>
            {error ? <FormAlert tone='error' error={apiError(error)} /> : null}
            {lists.isError && <FormAlert tone='error' error={apiError(lists.error)} />}
            <div className='space-y-1.5'>
               <label htmlFor={`${id}-list`} className='text-sm font-medium'>
                  Shopping list
               </label>
               <select id={`${id}-list`} className={cn(selectClass, 'w-full')} value={listId} onChange={(e) => setPicked(e.target.value)} disabled={!lists.data}>
                  {lists.data?.map((l) => (
                     <option key={l.id} value={l.id}>
                        {l.name}
                     </option>
                  ))}
               </select>
            </div>
            <DialogFooter>
               <Button type='button' variant='ghost' onClick={onClose}>
                  Cancel
               </Button>
               <Button onClick={() => onSubmit(listId)} disabled={!listId || isPending}>
                  {isPending ? 'Adding…' : 'Add items'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
