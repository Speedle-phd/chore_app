import { useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatTime, parseTime, prefers12h, timeSlots } from '@/lib/datetime'
import { cn } from '@/lib/utils'

type TimePickerProps = {
   /** `HH:mm` (24 h) */
   value: string
   onChange: (value: string) => void
   'aria-label': string
   invalid?: boolean
   className?: string
}

const HOUR12 = prefers12h()
const SLOTS = timeSlots(15)

/**
 * Themed time field: type a time ("19:30", "7.30pm", "730") or pick one from the
 * list (15-minute steps, in the viewer's 12/24-hour style). Up/Down move in the list.
 */
export function TimePicker({ value, onChange, 'aria-label': label, invalid, className }: TimePickerProps) {
   const [draft, setDraft] = useState<string | null>(null)
   const [open, setOpen] = useState(false)
   const list = useRef<HTMLDivElement>(null)
   const shown = draft ?? (value ? formatTime(value, HOUR12) : '')

   const commit = () => {
      if (draft === null) return
      const parsed = parseTime(draft)
      if (parsed) onChange(parsed)
      setDraft(null) // invalid input falls back to the last valid time
   }

   // Open on the chosen (or nearest) slot, focused and scrolled into view.
   const nearestSlot = () => {
      const nearest = SLOTS.find((s) => s >= (value || '09:00')) ?? SLOTS.at(-1)
      const el = list.current?.querySelector<HTMLButtonElement>(`[data-time="${nearest}"]`) ?? null
      el?.scrollIntoView({ block: 'center' })
      return el
   }

   const onListKey = (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-time]') ?? [])]
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
   }

   return (
      <div
         className={cn(
            'flex h-9 min-w-0 items-center rounded-lg border border-input bg-transparent transition-colors dark:bg-input/30',
            'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
            invalid && 'border-destructive',
            className,
         )}
      >
         <input
            type='text'
            inputMode='numeric'
            aria-label={label}
            aria-invalid={invalid || undefined}
            placeholder={HOUR12 ? '9:00 AM' : '09:00'}
            className='h-full w-full min-w-0 bg-transparent ps-2.5 text-base outline-none placeholder:text-muted-foreground md:text-sm'
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
               if (e.key === 'Enter') {
                  e.preventDefault()
                  commit()
               }
            }}
         />
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
               aria-label={`Choose ${label.toLowerCase()}`}
               className='grid h-full shrink-0 place-items-center rounded-e-lg px-2 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground'
            >
               <Clock className='size-4' />
            </PopoverTrigger>
            <PopoverContent align='end' className='w-36 p-1' initialFocus={nearestSlot} aria-label={`Choose ${label.toLowerCase()}`}>
               <div ref={list} role='listbox' aria-label={`Times for ${label.toLowerCase()}`} className='max-h-60 overflow-y-auto' onKeyDown={onListKey}>
                  {SLOTS.map((slot) => (
                     <button
                        key={slot}
                        type='button'
                        role='option'
                        data-time={slot}
                        aria-selected={slot === value}
                        tabIndex={-1}
                        onClick={() => {
                           onChange(slot)
                           setDraft(null)
                           setOpen(false)
                        }}
                        className={cn(
                           'block w-full rounded-md px-3 py-1.5 text-left text-sm tabular-nums outline-none',
                           'hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
                           slot === value && 'bg-primary font-medium text-primary-foreground hover:bg-primary focus-visible:bg-primary',
                        )}
                     >
                        {formatTime(slot, HOUR12)}
                     </button>
                  ))}
               </div>
            </PopoverContent>
         </Popover>
      </div>
   )
}
