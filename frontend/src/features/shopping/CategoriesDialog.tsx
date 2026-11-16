import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { selectClass } from '@/features/calendar/styles'
import { cn } from '@/lib/utils'
import { CATEGORY_ICONS, categoryIcon } from './categoryIcons'
import { useDeleteCategory, useOrderCategories, useSaveCategory, type ShoppingCategory } from './shoppingApi'

/**
 * Store sections in the order you walk through the shop. Move with the arrow
 * buttons (keyboard-friendly, no drag needed); names save when you leave the field.
 */
export function CategoriesDialog({ householdId, categories, onClose }: { householdId: string; categories: ShoppingCategory[]; onClose: () => void }) {
   const id = useId()
   const save = useSaveCategory(householdId)
   const remove = useDeleteCategory(householdId)
   const order = useOrderCategories(householdId)
   const [newName, setNewName] = useState('')
   const sorted = [...categories].sort((a, b) => a.position - b.position)
   const failed = (e: unknown) => toast.error(apiError(e).message)

   const move = (index: number, by: -1 | 1) => {
      const ids = sorted.map((c) => c.id)
      const [moved] = ids.splice(index, 1)
      if (!moved) return
      ids.splice(index + by, 0, moved)
      order.mutate(ids, { onError: failed })
   }

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='flex max-h-[92dvh] flex-col sm:max-w-lg'>
            <DialogHeader>
               <DialogTitle>Categories</DialogTitle>
               <DialogDescription>The list is sorted in this order, so put them in the order you walk through your shop.</DialogDescription>
            </DialogHeader>
            <ol className='scrollbar-slim -mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1' aria-label='Categories in order'>
               {sorted.map((c, i) => {
                  const Icon = categoryIcon(c.icon)
                  return (
                     <li key={c.id} className='flex flex-wrap items-center gap-2 rounded-xl border p-2'>
                        <Icon className='size-4 shrink-0 text-muted-foreground' aria-hidden />
                        <label htmlFor={`${id}-name-${c.id}`} className='sr-only'>
                           Name
                        </label>
                        <Input
                           id={`${id}-name-${c.id}`}
                           defaultValue={c.name}
                           maxLength={40}
                           className='h-9 min-w-40 flex-1'
                           onBlur={(e) => {
                              const name = e.target.value.trim()
                              if (name && name !== c.name) save.mutate({ id: c.id, name, icon: c.icon }, { onError: failed })
                              else e.target.value = c.name
                           }}
                           onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                        <label htmlFor={`${id}-icon-${c.id}`} className='sr-only'>
                           Icon for {c.name}
                        </label>
                        <select
                           id={`${id}-icon-${c.id}`}
                           className={cn(selectClass, 'w-28 shrink-0')}
                           value={c.icon}
                           onChange={(e) => save.mutate({ id: c.id, name: c.name, icon: e.target.value }, { onError: failed })}
                        >
                           {Object.entries(CATEGORY_ICONS).map(([key, { label }]) => (
                              <option key={key} value={key}>
                                 {label}
                              </option>
                           ))}
                        </select>
                        <span className='ms-auto flex shrink-0'>
                           <Button variant='ghost' size='icon' aria-label={`Move ${c.name} up`} disabled={i === 0 || order.isPending} onClick={() => move(i, -1)}>
                              <ArrowUp />
                           </Button>
                           <Button
                              variant='ghost'
                              size='icon'
                              aria-label={`Move ${c.name} down`}
                              disabled={i === sorted.length - 1 || order.isPending}
                              onClick={() => move(i, 1)}
                           >
                              <ArrowDown />
                           </Button>
                           <Button
                              variant='ghost'
                              size='icon'
                              aria-label={`Delete ${c.name}`}
                              disabled={remove.isPending}
                              onClick={() =>
                                 remove.mutate(c.id, {
                                    onSuccess: () => toast.success(`Deleted ${c.name}`, { description: 'Its items are now uncategorized.' }),
                                    onError: failed,
                                 })
                              }
                           >
                              <Trash2 className='text-destructive' />
                           </Button>
                        </span>
                     </li>
                  )
               })}
            </ol>
            <form
               className='flex gap-2 border-t pt-4'
               onSubmit={(e) => {
                  e.preventDefault()
                  if (!newName.trim()) return
                  save.mutate({ id: null, name: newName.trim(), icon: 'package' }, { onSuccess: () => setNewName(''), onError: failed })
               }}
            >
               <label htmlFor={`${id}-new`} className='sr-only'>
                  New category
               </label>
               <Input id={`${id}-new`} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder='New category, e.g. Pets' className='h-9' />
               <Button type='submit' className='h-9' disabled={!newName.trim() || save.isPending}>
                  <Plus />
                  Add
               </Button>
            </form>
         </DialogContent>
      </Dialog>
   )
}
