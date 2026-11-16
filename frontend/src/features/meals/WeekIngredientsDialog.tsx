import { useId, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import FormAlert from '@/features/auth/FormAlert'
import { selectClass } from '@/features/calendar/styles'
import { useAddItems, useShoppingLists } from '@/features/shopping/shoppingApi'
import { formatAmount } from '@/features/shopping/units'
import { useMealIngredients } from './mealsApi'
import { addDays, weekLabel } from './week'

/** Everything the week's meals need, merged; untick what you have, pick a list, add the rest. */
export function WeekIngredientsDialog({ householdId, monday, onClose }: { householdId: string; monday: string; onClose: () => void }) {
   const id = useId()
   const needed = useMealIngredients(householdId, monday, addDays(monday, 7), true)
   const lists = useShoppingLists(householdId)
   const [skipped, setSkipped] = useState<Set<number>>(new Set())
   const [listId, setListId] = useState('')
   const list = lists.data?.find((l) => l.id === listId) ?? lists.data?.[0]
   const add = useAddItems(householdId, list?.id ?? '')
   const items = needed.data?.items ?? []
   const chosen = items.filter((_, i) => !skipped.has(i))

   const submit = () => {
      if (!list || !chosen.length) return
      add.mutate(
         chosen.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, fromRecipeIds: i.recipeIds })),
         {
            onSuccess: () => {
               toast.success(`Added ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'} to ${list.name}`)
               onClose()
            },
            onError: (e) => toast.error(apiError(e).message),
         },
      )
   }

   return (
      <Dialog open onOpenChange={(next) => !next && !add.isPending && onClose()}>
         <DialogContent className='flex max-h-[92dvh] flex-col sm:max-w-lg'>
            <DialogHeader>
               <DialogTitle>This week’s ingredients</DialogTitle>
               <DialogDescription>{weekLabel(monday)}. Amounts are scaled to each meal’s servings and added up.</DialogDescription>
            </DialogHeader>
            {needed.isError && <FormAlert tone='error' error={apiError(needed.error)} />}
            {needed.isPending ? (
               <div className='h-40 animate-pulse rounded-xl bg-muted' aria-busy='true' aria-label='Loading ingredients' />
            ) : needed.data && (
               <>
                  {needed.data.withoutRecipe > 0 && (
                     <p className='text-sm text-muted-foreground'>
                        {needed.data.withoutRecipe} {needed.data.withoutRecipe === 1 ? 'meal has' : 'meals have'} no recipe, so nothing is listed for {needed.data.withoutRecipe === 1 ? 'it' : 'them'}.
                     </p>
                  )}
                  {items.length === 0 ? (
                     <p className='text-sm'>No ingredients: plan meals with recipes first.</p>
                  ) : (
                     <ul className='scrollbar-slim min-h-0 flex-1 space-y-1 overflow-y-auto' aria-label='Ingredients'>
                        {items.map((item, i) => (
                           <li key={`${item.name}-${item.unit}-${i}`}>
                              <label className='flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-muted/40'>
                                 <Checkbox
                                    className='mt-0.5'
                                    checked={!skipped.has(i)}
                                    onCheckedChange={(on) =>
                                       setSkipped((prev) => {
                                          const next = new Set(prev)
                                          if (on) next.delete(i)
                                          else next.add(i)
                                          return next
                                       })
                                    }
                                 />
                                 <span className={skipped.has(i) ? 'text-muted-foreground line-through' : ''}>
                                    {formatAmount(item.quantity, item.unit) && <span className='font-semibold tabular-nums'>{formatAmount(item.quantity, item.unit)} </span>}
                                    {item.name}
                                    <span className='block text-xs text-muted-foreground'>{item.recipes.join(', ')}</span>
                                 </span>
                              </label>
                           </li>
                        ))}
                     </ul>
                  )}
               </>
            )}
            <DialogFooter className='items-end sm:justify-between'>
               {lists.data && lists.data.length > 1 ? (
                  <div className='flex flex-col gap-1'>
                     <label htmlFor={`${id}-list`} className='text-xs font-medium'>
                        List
                     </label>
                     <select id={`${id}-list`} className={selectClass} value={list?.id ?? ''} onChange={(e) => setListId(e.target.value)}>
                        {lists.data.map((l) => (
                           <option key={l.id} value={l.id}>
                              {l.name}
                           </option>
                        ))}
                     </select>
                  </div>
               ) : (
                  <span />
               )}
               <Button size='lg' className='px-4' onClick={submit} disabled={!list || !chosen.length || add.isPending}>
                  <ShoppingCart />
                  {chosen.length ? `Add ${chosen.length} to ${list?.name ?? 'the list'}` : 'Nothing to add'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
