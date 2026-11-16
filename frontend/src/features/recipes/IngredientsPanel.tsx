import { useId, useState } from 'react'
import { Minus, Plus, ShoppingCart } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { selectClass } from '@/features/calendar/styles'
import { useShoppingLists } from '@/features/shopping/shoppingApi'
import { formatAmount } from '@/features/shopping/units'
import { scaleIngredient } from './format'
import { useRecipeToList, type Recipe } from './recipesApi'

/**
 * Ingredients for any number of servings. Untick what you already have, pick a
 * list, add the rest (amounts merge with what's on the list).
 */
export function IngredientsPanel({ householdId, recipe }: { householdId: string; recipe: Recipe }) {
   const id = useId()
   const navigate = useNavigate()
   const lists = useShoppingLists(householdId)
   const toList = useRecipeToList(householdId, recipe.id)
   const [servings, setServings] = useState(recipe.servings)
   const [skipped, setSkipped] = useState<Set<number>>(new Set())
   const [listId, setListId] = useState('')
   const list = lists.data?.find((l) => l.id === listId) ?? lists.data?.[0]
   const chosen = recipe.ingredients.map((_, i) => i).filter((i) => !skipped.has(i))

   const add = () => {
      if (!list || !chosen.length) return
      toList.mutate(
         { listId: list.id, servings, ingredients: chosen },
         {
            onSuccess: () =>
               toast.success(`Added ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'} to ${list.name}`, {
                  action: { label: 'Open list', onClick: () => navigate(`/shopping-list?list=${list.id}`) },
               }),
            onError: (e) => toast.error(apiError(e).message),
         },
      )
   }

   return (
      <section aria-labelledby={`${id}-title`} className='space-y-4 rounded-2xl border bg-card p-4'>
         <div className='flex flex-wrap items-center justify-between gap-3'>
            <h2 id={`${id}-title`} className='text-lg font-semibold'>
               Ingredients
            </h2>
            <div className='flex items-center gap-1' role='group' aria-label='Servings'>
               <Button variant='outline' size='icon' aria-label='Fewer servings' disabled={servings <= 1} onClick={() => setServings((s) => s - 1)}>
                  <Minus />
               </Button>
               <output className='min-w-24 text-center text-sm tabular-nums' aria-live='polite'>
                  {servings} {servings === 1 ? 'serving' : 'servings'}
               </output>
               <Button variant='outline' size='icon' aria-label='More servings' disabled={servings >= 100} onClick={() => setServings((s) => s + 1)}>
                  <Plus />
               </Button>
            </div>
         </div>

         {recipe.ingredients.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No ingredients listed.</p>
         ) : (
            <>
               <p className='text-xs text-muted-foreground'>Untick what you already have.</p>
               <ul className='space-y-1'>
                  {recipe.ingredients.map((raw, i) => {
                     const ing = scaleIngredient(raw, recipe.servings, servings)
                     const amount = formatAmount(ing.quantity, ing.unit)
                     return (
                        <li key={`${raw.text}-${i}`}>
                           <label className='flex min-h-9 cursor-pointer items-start gap-3 rounded-lg px-1 py-1 hover:bg-muted/40'>
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
                                 {amount && <span className='font-semibold tabular-nums'>{amount} </span>}
                                 {ing.name}
                                 {ing.note && <span className='text-muted-foreground'> · {ing.note}</span>}
                              </span>
                           </label>
                        </li>
                     )
                  })}
               </ul>
               <div className='flex flex-wrap items-end gap-2 border-t pt-4'>
                  {lists.data && lists.data.length > 1 && (
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
                  )}
                  <Button className='h-9' onClick={add} disabled={!list || !chosen.length || toList.isPending}>
                     <ShoppingCart />
                     {chosen.length ? `Add ${chosen.length} to ${list?.name ?? 'the list'}` : 'Nothing to add'}
                  </Button>
                  {lists.isError && (
                     <p className='text-sm text-destructive'>
                        Couldn’t load your lists. <Link to='/shopping-list'>Open the shopping list</Link>
                     </p>
                  )}
               </div>
            </>
         )}
      </section>
   )
}
