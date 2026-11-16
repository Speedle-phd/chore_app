import { useId, useState } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { History, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { selectClass } from '@/features/calendar/styles'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { categoryIcon } from './categoryIcons'
import { useAddItems, useSuggestions, type ShoppingCategory, type Suggestion } from './shoppingApi'
import { formatAmount, parseQuantity, UNITS, type UnitId } from './units'

const inputClass =
   'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30'

/**
 * Amount · unit · what. The name field suggests the household's own items first,
 * then common groceries; picking one fills in its usual unit and amount.
 */
export function AddItemBar({ householdId, listId, categories }: { householdId: string; listId: string; categories: ShoppingCategory[] }) {
   const id = useId()
   const add = useAddItems(householdId, listId)
   const [name, setName] = useState('')
   const [amount, setAmount] = useState('')
   const [unit, setUnit] = useState<UnitId | ''>('')
   const [open, setOpen] = useState(false)
   const query = useDebounce(name, 150)
   const suggestions = useSuggestions(householdId, query, open)
   const items = suggestions.data ?? []
   const quantity = parseQuantity(amount)

   const pick = (s: Suggestion) => {
      // Fill in the usual amount and unit only when nothing was typed there yet.
      if (!amount && s.quantity !== null) setAmount(String(s.quantity))
      if (!unit && s.unit) setUnit(s.unit)
   }

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!name.trim() || quantity === undefined) return
      const typed = { name, amount, unit }
      // Clear at once so the next item can be typed right away; put it back if saving fails.
      // Close the suggestions too: while open they cover the list (and hide it from screen readers).
      setOpen(false)
      setName('')
      setAmount('')
      setUnit('')
      add.mutate([{ name: typed.name.trim(), quantity, unit: typed.unit || null }], {
         onError: (err) => {
            setName(typed.name)
            setAmount(typed.amount)
            setUnit(typed.unit)
            toast.error(apiError(err).message)
         },
      })
   }

   return (
      <form onSubmit={submit} className='flex flex-wrap items-start gap-2 rounded-2xl border bg-card p-3' aria-label='Add an item'>
         <div className='w-20 shrink-0'>
            <label htmlFor={`${id}-amount`} className='sr-only'>
               Amount
            </label>
            <input
               id={`${id}-amount`}
               inputMode='decimal'
               placeholder='Amount'
               className={cn(inputClass, quantity === undefined && 'border-destructive')}
               aria-invalid={quantity === undefined}
               aria-describedby={quantity === undefined ? `${id}-amount-error` : undefined}
               value={amount}
               onChange={(e) => setAmount(e.target.value)}
            />
         </div>
         <div className='w-24 shrink-0'>
            <label htmlFor={`${id}-unit`} className='sr-only'>
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
         <div className='min-w-40 flex-1'>
            <label htmlFor={`${id}-name`} className='sr-only'>
               What to buy
            </label>
            <Autocomplete.Root
               items={items}
               filteredItems={items}
               value={name}
               open={open && items.length > 0}
               onOpenChange={setOpen}
               openOnInputClick
               itemToStringValue={(s: Suggestion) => s.name}
               onValueChange={(value, details) => {
                  // Escape only closes the suggestions; it shouldn't throw away what was typed.
                  if (details.reason === 'escape-key') return
                  setName(value)
                  if (details.reason === 'item-press') {
                     const s = items.find((x) => x.name === value)
                     if (s) pick(s)
                  }
               }}
            >
               <Autocomplete.Input id={`${id}-name`} placeholder='Add an item, e.g. Milch' className={inputClass} autoComplete='off' />
               <Autocomplete.Portal>
                  <Autocomplete.Positioner sideOffset={4} className='z-60 outline-none'>
                     <Autocomplete.Popup className='max-h-80 w-(--anchor-width) min-w-60 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg scrollbar-slim'>
                        <Autocomplete.List>
                           {(s: Suggestion) => {
                              const category = categories.find((c) => c.id === s.categoryId)
                              const Icon = categoryIcon(category?.icon)
                              return (
                                 <Autocomplete.Item
                                    key={`${s.source}-${s.name}`}
                                    value={s}
                                    className='flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'
                                 >
                                    {s.source === 'history' ? (
                                       <History className='size-3.5 shrink-0 text-muted-foreground' aria-label='Bought before' />
                                    ) : (
                                       <span className='size-3.5 shrink-0' aria-hidden />
                                    )}
                                    <span className='min-w-0 flex-1 truncate'>{s.name}</span>
                                    {(s.quantity !== null || s.unit) && (
                                       <span className='shrink-0 text-xs text-muted-foreground'>{formatAmount(s.quantity, s.unit)}</span>
                                    )}
                                    {category && (
                                       <span className='flex shrink-0 items-center gap-1 text-xs text-muted-foreground'>
                                          <Icon className='size-3.5' aria-hidden />
                                          {category.name}
                                       </span>
                                    )}
                                 </Autocomplete.Item>
                              )
                           }}
                        </Autocomplete.List>
                     </Autocomplete.Popup>
                  </Autocomplete.Positioner>
               </Autocomplete.Portal>
            </Autocomplete.Root>
         </div>
         <Button type='submit' className='h-9' disabled={!name.trim() || quantity === undefined}>
            <Plus />
            Add
         </Button>
         {quantity === undefined && (
            <p id={`${id}-amount-error`} className='w-full text-xs text-destructive'>
               Use a number for the amount, like 2, 1,5 or ½.
            </p>
         )}
      </form>
   )
}
