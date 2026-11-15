import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * App-styled checkbox (Base UI). Wrap it in a <label> with the text, or give it an
 * aria-label. The unchecked border uses the muted text colour so it keeps 3:1
 * contrast (WCAG 1.4.11) in every theme.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
   return (
      <CheckboxPrimitive.Root
         data-slot='checkbox'
         className={cn(
            'peer relative grid size-4.5 shrink-0 place-items-center rounded-[5px] border border-muted-foreground/80 bg-background outline-none transition-colors',
            'after:absolute after:-inset-2 hover:border-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
            'data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground',
            // No dark:bg-* here: the theme selector would outrank data-checked:bg-primary (empty-looking ticked box).
            'data-disabled:cursor-not-allowed data-disabled:opacity-50',
            className,
         )}
         {...props}
      >
         <CheckboxPrimitive.Indicator className='grid place-items-center text-current motion-safe:transition-transform data-starting-style:scale-50'>
            <CheckIcon className='size-3.5' strokeWidth={3} />
         </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
   )
}

export { Checkbox }
