import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { cn } from '@/lib/utils'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

/** Themed popover panel; sits above dialogs (z-60) so pickers work inside them. */
function PopoverContent({
   className,
   align = 'start',
   sideOffset = 6,
   children,
   ...props
}: PopoverPrimitive.Popup.Props & { align?: 'start' | 'center' | 'end'; sideOffset?: number }) {
   return (
      <PopoverPrimitive.Portal>
         <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} className='z-60'>
            <PopoverPrimitive.Popup
               className={cn(
                  'rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none',
                  'origin-(--transform-origin) motion-safe:transition-[opacity,transform] motion-safe:duration-150',
                  'data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0',
                  className,
               )}
               {...props}
            >
               {children}
            </PopoverPrimitive.Popup>
         </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
   )
}

export { Popover, PopoverTrigger, PopoverContent }
