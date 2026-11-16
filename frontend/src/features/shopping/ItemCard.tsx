import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { useUpdateItem, type ShoppingItem } from './shoppingApi'
import { formatAmount } from './units'

/**
 * One item as a small card. Tapping the card puts it in the basket (or back): a
 * toggle button, so screen readers hear "pressed" for items in the basket. The
 * corner pencil edits (and deletes) it.
 */
export function ItemCard({ householdId, item, onEdit }: { householdId: string; item: ShoppingItem; onEdit: (item: ShoppingItem) => void }) {
   const update = useUpdateItem(householdId, item.listId)
   const amount = formatAmount(item.quantity, item.unit)
   return (
      <li className='relative'>
         <button
            type='button'
            aria-pressed={item.checked}
            onClick={() => update.mutate({ id: item.id, change: { checked: !item.checked } }, { onError: (e) => toast.error(apiError(e).message) })}
            className={cn(
               'flex h-full min-h-18 w-full flex-col items-start gap-0.5 rounded-xl border p-2.5 pe-8 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
               item.checked ? 'border-dashed bg-transparent text-muted-foreground' : 'bg-card hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98]',
            )}
         >
            <span className={cn('leading-snug font-medium wrap-break-word', item.checked && 'line-through')}>{item.name}</span>
            {amount && <span className='text-sm tabular-nums'>{amount}</span>}
            {item.note && <span className='line-clamp-2 text-xs text-muted-foreground'>{item.note}</span>}
         </button>
         <button
            type='button'
            onClick={() => onEdit(item)}
            aria-label={`Edit ${item.name}`}
            className='absolute top-1 right-1 grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
         >
            <Pencil className='size-3.5' aria-hidden />
         </button>
      </li>
   )
}
