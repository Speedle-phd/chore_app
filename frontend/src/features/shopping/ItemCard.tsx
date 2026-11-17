import { Check, Pencil } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { useUpdateItem, type ShoppingItem } from './shoppingApi'
import { formatAmount } from './units'

/** Shared with the basket chip, so a ticked item visibly moves into the basket. */
const move = { type: 'spring', stiffness: 500, damping: 38 } as const

/**
 * One item still to get. Tapping the card puts it in the basket: a toggle button,
 * so screen readers hear "not pressed"; the empty circle shows it can be ticked.
 * The corner pencil edits (and deletes) it.
 */
export function ItemCard({ householdId, item, onEdit }: { householdId: string; item: ShoppingItem; onEdit: (item: ShoppingItem) => void }) {
   const update = useUpdateItem(householdId, item.listId)
   const amount = formatAmount(item.quantity, item.unit)
   return (
      <motion.li layoutId={`shopping-${item.id}`} transition={move} className='relative'>
         <button
            type='button'
            aria-pressed={item.checked}
            onClick={() => update.mutate({ id: item.id, change: { checked: !item.checked } }, { onError: (e) => toast.error(apiError(e).message) })}
            className={cn(
               'group flex h-full min-h-16 w-full items-start gap-2.5 rounded-xl border bg-card p-2.5 pe-8 text-left outline-none transition-colors',
               'hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]',
            )}
         >
            <span
               aria-hidden
               className='mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-muted-foreground/50 text-primary-foreground transition-colors group-hover:border-primary group-aria-pressed:border-primary group-aria-pressed:bg-primary'
            >
               <Check className='size-3 opacity-0 group-hover:opacity-40 group-aria-pressed:opacity-100' strokeWidth={3} />
            </span>
            <span className='flex min-w-0 flex-col gap-0.5'>
               <span className='leading-snug font-medium wrap-break-word'>{item.name}</span>
               {amount && <span className='text-sm text-muted-foreground tabular-nums'>{amount}</span>}
               {item.note && <span className='line-clamp-2 text-xs text-muted-foreground'>{item.note}</span>}
            </span>
         </button>
         <button
            type='button'
            onClick={() => onEdit(item)}
            aria-label={`Edit ${item.name}`}
            className='absolute top-1 right-1 grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
         >
            <Pencil className='size-3.5' aria-hidden />
         </button>
      </motion.li>
   )
}

/** An item in the basket: a small chip; tapping it puts it back on the list. */
export function BasketChip({ householdId, item }: { householdId: string; item: ShoppingItem }) {
   const update = useUpdateItem(householdId, item.listId)
   const amount = formatAmount(item.quantity, item.unit)
   return (
      <motion.li layoutId={`shopping-${item.id}`} transition={move}>
         <button
            type='button'
            aria-pressed
            title='Put it back on the list'
            onClick={() => update.mutate({ id: item.id, change: { checked: false } }, { onError: (e) => toast.error(apiError(e).message) })}
            className='flex max-w-56 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 ps-1.5 pe-3 text-sm outline-none transition-colors hover:border-primary/60 hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50'
         >
            <span aria-hidden className='grid size-4.5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground'>
               <Check className='size-3' strokeWidth={3} />
            </span>
            <span className='truncate text-muted-foreground line-through decoration-muted-foreground/60'>{item.name}</span>
            {amount && <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>{amount}</span>}
         </button>
      </motion.li>
   )
}
