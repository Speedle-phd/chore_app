import { useId, useState } from 'react'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import FormAlert from '@/features/auth/FormAlert'
import { pressedClass } from '@/features/calendar/styles'
import { cn } from '@/lib/utils'
import { useCreateList, useDeleteList, useRenameList, type ShoppingList } from './shoppingApi'

type ListSwitcherProps = {
   householdId: string
   lists: ShoppingList[]
   current: ShoppingList
   onSelect: (id: string) => void
   /** Delete right for this list (creator or admin). */
   canDelete: (list: ShoppingList) => boolean
}

/** One chip per list (with open items), "New list", and rename/delete for the current one. */
export function ListSwitcher({ householdId, lists, current, onSelect, canDelete }: ListSwitcherProps) {
   const [naming, setNaming] = useState<'new' | 'rename' | null>(null)
   const [deleting, setDeleting] = useState(false)
   const remove = useDeleteList(householdId)
   const mayDelete = canDelete(current)

   return (
      <div className='flex flex-wrap items-center gap-2'>
         <ToggleGroup
            aria-label='Shopping lists'
            variant='outline'
            spacing={1}
            className='flex-wrap'
            value={[current.id]}
            onValueChange={(v) => v[0] && onSelect(v[0])}
         >
            {lists.map((l) => (
               <ToggleGroupItem key={l.id} value={l.id} className={cn('h-9 gap-2 px-3', pressedClass)}>
                  {l.name}
                  <span className='rounded-full bg-muted px-1.5 text-xs font-medium text-foreground tabular-nums' aria-label={`${l.openCount} to buy`}>
                     {l.openCount}
                  </span>
               </ToggleGroupItem>
            ))}
         </ToggleGroup>
         <Button variant='outline' className='h-9' onClick={() => setNaming('new')}>
            <Plus />
            New list
         </Button>
         <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant='ghost' size='icon' aria-label={`More for “${current.name}”`} />}>
               <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='min-w-44'>
               <DropdownMenuItem onClick={() => setNaming('rename')}>
                  <Pencil />
                  Rename
               </DropdownMenuItem>
               <DropdownMenuItem disabled={!mayDelete} onClick={() => setDeleting(true)}>
                  <Trash2 />
                  {mayDelete ? 'Delete list' : 'Delete (only who made it or an admin)'}
               </DropdownMenuItem>
            </DropdownMenuContent>
         </DropdownMenu>

         {naming && (
            <ListNameDialog
               householdId={householdId}
               list={naming === 'rename' ? current : null}
               onDone={(id) => {
                  setNaming(null)
                  if (id) onSelect(id)
               }}
            />
         )}
         <ConfirmDeleteDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`Delete “${current.name}”?`}
            description={`Its ${current.openCount ? `${current.openCount} open ` : ''}items are deleted too.`}
            confirmLabel='Delete list'
            isPending={remove.isPending}
            onConfirm={() =>
               remove.mutate(current.id, {
                  onSuccess: () => {
                     setDeleting(false)
                     toast.success('List deleted')
                     const next = lists.find((l) => l.id !== current.id)
                     if (next) onSelect(next.id)
                  },
                  onError: (e) => toast.error(apiError(e).message),
               })
            }
         />
      </div>
   )
}

function ListNameDialog({ householdId, list, onDone }: { householdId: string; list: ShoppingList | null; onDone: (selectId: string | null) => void }) {
   const id = useId()
   const [name, setName] = useState(list?.name ?? '')
   const create = useCreateList(householdId)
   const rename = useRenameList(householdId)
   const pending = create.isPending || rename.isPending
   const error = create.error ?? rename.error
   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!name.trim()) return
      if (list) rename.mutate({ id: list.id, name: name.trim() }, { onSuccess: () => onDone(null) })
      else create.mutate(name.trim(), { onSuccess: (created) => onDone(created.id) })
   }
   return (
      <Dialog open onOpenChange={(next) => !next && onDone(null)}>
         <DialogContent className='sm:max-w-sm'>
            <DialogHeader>
               <DialogTitle>{list ? 'Rename list' : 'New list'}</DialogTitle>
            </DialogHeader>
            <form id={`${id}-form`} onSubmit={submit} className='space-y-2'>
               {error && <FormAlert tone='error' error={apiError(error)} />}
               <label htmlFor={`${id}-name`} className='text-sm font-medium'>
                  Name
               </label>
               <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder='e.g. Drugstore, Party' autoFocus />
            </form>
            <DialogFooter>
               <Button type='submit' form={`${id}-form`} size='lg' className='px-4' disabled={!name.trim() || pending}>
                  {list ? 'Save' : 'Create list'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
