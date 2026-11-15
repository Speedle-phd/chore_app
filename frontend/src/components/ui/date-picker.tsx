import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Temporal } from 'temporal-polyfill'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addDays, addMonthsClamped, monthGrid, yearMonthOf } from '@/lib/datetime'
import { cn } from '@/lib/utils'

type DatePickerProps = {
   /** `YYYY-MM-DD` or '' */
   value: string
   onChange: (value: string) => void
   'aria-label': string
   invalid?: boolean
   className?: string
}

const today = () => Temporal.Now.plainDateISO().toString()
const asDate = (d: string) => new Date(`${d}T12:00:00`)
const WEEKDAYS = monthGrid('2026-11')[1]?.map((d) => ({
   short: asDate(d).toLocaleDateString(undefined, { weekday: 'narrow' }),
   long: asDate(d).toLocaleDateString(undefined, { weekday: 'long' }),
})) ?? []

/**
 * Themed date picker: a field-like button that opens a month calendar.
 * Keyboard (WAI-ARIA date picker dialog): arrows move by day/week, Home/End to
 * week start/end, PageUp/PageDown by month (+Shift: year), Enter selects, Esc closes.
 */
export function DatePicker({ value, onChange, 'aria-label': label, invalid, className }: DatePickerProps) {
   const [open, setOpen] = useState(false)
   const [focus, setFocus] = useState(value || today())
   const grid = useRef<HTMLTableElement>(null)
   // Set by the grid's keyboard handler: a month change re-renders every day, so focus must be moved explicitly.
   const keyboardMove = useRef(false)

   const dayButton = (date: string) => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`) ?? null
   // Keep keyboard focus on the focused day as it moves (opening is handled by initialFocus).
   useEffect(() => {
      if (open && keyboardMove.current) {
         keyboardMove.current = false
         dayButton(focus)?.focus()
      }
   }, [focus, open])

   // Compact so it fits narrow columns; the accessible name contains exactly this visible text (WCAG 2.5.3).
   const pretty = value ? asDate(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'
   const month = yearMonthOf(focus)
   const heading = asDate(`${month}-15`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

   const choose = (date: string) => {
      onChange(date)
      setOpen(false)
   }
   const onKeyDown = (e: React.KeyboardEvent) => {
      const dow = Temporal.PlainDate.from(focus).dayOfWeek // 1 = Monday
      const moves: Record<string, () => string> = {
         ArrowLeft: () => addDays(focus, -1),
         ArrowRight: () => addDays(focus, 1),
         ArrowUp: () => addDays(focus, -7),
         ArrowDown: () => addDays(focus, 7),
         Home: () => addDays(focus, 1 - dow),
         End: () => addDays(focus, 7 - dow),
         PageUp: () => addMonthsClamped(focus, e.shiftKey ? -12 : -1),
         PageDown: () => addMonthsClamped(focus, e.shiftKey ? 12 : 1),
      }
      const move = moves[e.key]
      if (!move) return
      e.preventDefault()
      keyboardMove.current = true
      setFocus(move())
   }

   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            if (next) setFocus(value || today())
            setOpen(next)
         }}
      >
         <PopoverTrigger
            render={
               <button
                  type='button'
                  aria-label={`${label}: ${pretty}`}
                  aria-invalid={invalid || undefined}
                  className={cn(
                     'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-base transition-colors outline-none md:text-sm dark:bg-input/30',
                     'hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-expanded:border-ring',
                     !value && 'text-muted-foreground',
                     className,
                  )}
               />
            }
         >
            <CalendarDays className='size-4 shrink-0 text-muted-foreground' aria-hidden />
            <span className='truncate'>{pretty}</span>
         </PopoverTrigger>
         <PopoverContent
            className='w-72'
            aria-label={`Choose ${label.toLowerCase()}`}
            // Open with the chosen (or today's) day focused, so the arrow keys work at once.
            initialFocus={() => dayButton(value || today())}
         >
            <div className='mb-2 flex items-center justify-between'>
               <Button type='button' variant='ghost' size='icon-sm' aria-label='Previous month' onClick={() => setFocus(addMonthsClamped(focus, -1))}>
                  <ChevronLeft />
               </Button>
               <h3 className='text-sm font-semibold' aria-live='polite'>
                  {heading}
               </h3>
               <Button type='button' variant='ghost' size='icon-sm' aria-label='Next month' onClick={() => setFocus(addMonthsClamped(focus, 1))}>
                  <ChevronRight />
               </Button>
            </div>
            <table ref={grid} role='grid' aria-label={heading} className='w-full table-fixed border-collapse text-center' onKeyDown={onKeyDown}>
               <thead>
                  <tr>
                     {WEEKDAYS.map((w) => (
                        <th key={w.long} scope='col' abbr={w.long} className='pb-1 text-xs font-medium text-muted-foreground'>
                           {w.short}
                        </th>
                     ))}
                  </tr>
               </thead>
               <tbody>
                  {monthGrid(month).map((week) => (
                     <tr key={week[0]}>
                        {week.map((d) => {
                           const selected = d === value
                           const outside = yearMonthOf(d) !== month
                           const isToday = d === today()
                           return (
                              <td key={d} className='p-0.5' aria-selected={selected}>
                                 <button
                                    type='button'
                                    data-date={d}
                                    tabIndex={d === focus ? 0 : -1}
                                    aria-current={isToday ? 'date' : undefined}
                                    aria-label={asDate(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                    onClick={() => choose(d)}
                                    onKeyDown={(e) => {
                                       if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          choose(d)
                                       }
                                    }}
                                    className={cn(
                                       // 7 × (32 px + 4 px padding) = 252 px: fits the popup (264 px inside); the 2 px ring fits the padding.
                                       'mx-auto grid size-8 place-items-center rounded-lg text-sm outline-none transition-colors',
                                       'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                                       outside && 'text-muted-foreground',
                                       isToday && !selected && 'font-semibold text-primary ring-1 ring-primary/40',
                                       // On the filled day the ring would vanish in the fill colour; use the text colour instead.
                                       selected && 'bg-primary font-semibold text-primary-foreground hover:bg-primary focus-visible:ring-foreground',
                                    )}
                                 >
                                    {Number(d.slice(8))}
                                 </button>
                              </td>
                           )
                        })}
                     </tr>
                  ))}
               </tbody>
            </table>
            <div className='mt-2 flex justify-end border-t pt-2'>
               <Button type='button' variant='ghost' size='sm' onClick={() => choose(today())}>
                  Today
               </Button>
            </div>
         </PopoverContent>
      </Popover>
   )
}
