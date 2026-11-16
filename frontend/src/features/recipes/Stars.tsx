import { useId } from 'react'
import { Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Read-only stars (half steps rounded), with the number for screen readers. */
export function Stars({ value, count, className }: { value: number | null; count?: number; className?: string }) {
   if (value === null) return <span className={cn('text-xs text-muted-foreground', className)}>Not rated yet</span>
   const rounded = Math.round(value * 2) / 2
   return (
      <span className={cn('inline-flex items-center gap-1', className)}>
         <span className='sr-only'>
            {value.toLocaleString(undefined, { maximumFractionDigits: 1 })} out of 5 stars{count ? ` from ${count} ${count === 1 ? 'rating' : 'ratings'}` : ''}
         </span>
         <span className='flex' aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
               <Star
                  key={n}
                  className={cn('size-3.5', n <= rounded ? 'fill-amber-400 text-amber-500' : n - 0.5 === rounded ? 'fill-amber-400/50 text-amber-500' : 'text-muted-foreground/60')}
               />
            ))}
         </span>
         <span className='text-xs text-muted-foreground tabular-nums' aria-hidden>
            {value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            {count ? ` (${count})` : ''}
         </span>
      </span>
   )
}

/**
 * Your rating: a radio group of 1–5 stars (arrow keys move, Space/Enter picks), plus "clear".
 * Native radios underneath, so keyboard and screen readers work without extra code.
 */
export function StarInput({ value, onChange, disabled }: { value: number | null; onChange: (stars: number | null) => void; disabled?: boolean }) {
   const name = useId()
   return (
      <fieldset className='flex items-center gap-1' disabled={disabled}>
         <legend className='sr-only'>Your rating</legend>
         {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className='group relative cursor-pointer rounded-md p-1 has-focus-visible:ring-3 has-focus-visible:ring-ring/50'>
               <input type='radio' name={name} value={n} checked={value === n} onChange={() => onChange(n)} className='sr-only' />
               <span className='sr-only'>
                  {n} {n === 1 ? 'star' : 'stars'}
               </span>
               <Star
                  aria-hidden
                  className={cn('size-6 transition-colors', value !== null && n <= value ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground group-hover:text-amber-500')}
               />
            </label>
         ))}
         {value !== null && (
            <button
               type='button'
               onClick={() => onChange(null)}
               className='ms-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
            >
               <X className='size-3.5' aria-hidden />
               Clear
            </button>
         )}
      </fieldset>
   )
}
