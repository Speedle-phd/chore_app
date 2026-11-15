import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { NO_REPEAT, WEEKDAY_LABEL, WEEKDAYS, weekdayOf, type Freq, type Repeat, type RepeatEnd, type Weekday } from './recurrence'
import { pressedClass, selectClass } from './styles'

const FREQ_LABEL: Record<Freq, string> = {
   none: 'Does not repeat',
   DAILY: 'Daily',
   WEEKLY: 'Weekly',
   MONTHLY: 'Monthly',
   YEARLY: 'Yearly',
   AFTER: 'After it’s done',
}
const UNIT: Record<Exclude<Freq, 'none'>, [string, string]> = {
   DAILY: ['day', 'days'],
   WEEKLY: ['week', 'weeks'],
   MONTHLY: ['month', 'months'],
   YEARLY: ['year', 'years'],
   AFTER: ['day', 'days'],
}

type RecurrenceEditorProps = {
   id: string
   value: Repeat | 'custom'
   onChange: (value: Repeat | 'custom') => void
   /** Local start (`YYYY-MM-DD…`): its weekday is the default for weekly repeats. */
   start: string
   /** Suggested last date when switching to "until". */
   defaultUntil: string
   /** Offer "after it's done" (chores). */
   allowAfterCompletion?: boolean
}

const clampInt = (raw: string, min: number, max: number) => {
   const n = Number.parseInt(raw, 10)
   return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
}

/** Compact repeat editor: frequency + interval on one row, weekdays, end condition on one row. */
export function RecurrenceEditor({ id, value, onChange, start, defaultUntil, allowAfterCompletion = false }: RecurrenceEditorProps) {
   const custom = value === 'custom'
   const repeat = custom ? NO_REPEAT : value
   const set = (patch: Partial<Repeat>) => onChange({ ...repeat, ...patch })
   const repeating = !custom && repeat.freq !== 'none'
   const after = repeat.freq === 'AFTER'

   return (
      <div className='space-y-2'>
         <label htmlFor={`${id}-freq`} className='block text-sm font-medium'>
            Repeat
         </label>
         <div className='flex flex-wrap items-center gap-2'>
            <select
               id={`${id}-freq`}
               className={cn(selectClass, repeating ? 'flex-1' : 'w-full')}
               value={custom ? 'custom' : repeat.freq}
               onChange={(e) => {
                  const freq = e.target.value as Freq | 'custom'
                  if (freq === 'custom') return
                  onChange({
                     ...repeat,
                     freq,
                     interval: freq === 'AFTER' && repeat.freq !== 'AFTER' ? 7 : repeat.interval,
                     byDay: freq === 'WEEKLY' && !repeat.byDay.length ? [weekdayOf(start)] : repeat.byDay,
                     end: freq === 'AFTER' ? { type: 'never' } : repeat.end,
                  })
               }}
            >
               {custom && <option value='custom'>Custom (kept as it is)</option>}
               {Object.entries(FREQ_LABEL)
                  .filter(([freq]) => freq !== 'AFTER' || allowAfterCompletion || after)
                  .map(([freq, label]) => (
                     <option key={freq} value={freq}>
                        {label}
                     </option>
                  ))}
            </select>
            {!custom && repeat.freq !== 'none' && (
               <span className='flex items-center gap-2 text-sm'>
                  <label htmlFor={`${id}-interval`}>{after ? 'next one' : 'every'}</label>
                  <Input
                     id={`${id}-interval`}
                     type='number'
                     inputMode='numeric'
                     min={1}
                     max={after ? 365 : 99}
                     className='h-9 w-16'
                     value={repeat.interval}
                     onChange={(e) => set({ interval: clampInt(e.target.value, 1, after ? 365 : 99) })}
                  />
                  {UNIT[repeat.freq][repeat.interval === 1 ? 0 : 1]}
                  {after && ' later'}
               </span>
            )}
         </div>

         {repeating && repeat.freq === 'WEEKLY' && (
            <ToggleGroup
               multiple
               aria-label='Repeat on'
               variant='outline'
               spacing={1}
               className='flex-wrap'
               value={repeat.byDay}
               onValueChange={(days) => {
                  const picked = days as Weekday[]
                  // At least one day: an empty selection falls back to the start's weekday.
                  set({ byDay: picked.length ? picked : [weekdayOf(start)] })
               }}
            >
               {WEEKDAYS.map((day) => (
                  <ToggleGroupItem key={day} value={day} title={WEEKDAY_LABEL[day].long} className={cn('h-8 min-w-10 px-2', pressedClass)}>
                     {WEEKDAY_LABEL[day].short}
                  </ToggleGroupItem>
               ))}
            </ToggleGroup>
         )}

         {repeating && !after && (
            <div className='flex flex-wrap items-center gap-2 text-sm'>
               <label htmlFor={`${id}-ends`}>Ends</label>
               <select
                  id={`${id}-ends`}
                  className={selectClass}
                  value={repeat.end.type}
                  onChange={(e) => {
                     const type = e.target.value as RepeatEnd['type']
                     if (type === 'never') set({ end: { type: 'never' } })
                     if (type === 'until') set({ end: { type: 'until', date: defaultUntil } })
                     if (type === 'count') set({ end: { type: 'count', count: 10 } })
                  }}
               >
                  <option value='never'>never</option>
                  <option value='until'>on date</option>
                  <option value='count'>after</option>
               </select>
               {repeat.end.type === 'until' && (
                  <Input
                     type='date'
                     aria-label='Last date'
                     className='h-9 w-auto'
                     value={repeat.end.date}
                     onChange={(e) => e.target.value && set({ end: { type: 'until', date: e.target.value } })}
                  />
               )}
               {repeat.end.type === 'count' && (
                  <span className='flex items-center gap-2'>
                     <Input
                        type='number'
                        inputMode='numeric'
                        aria-label='Number of times'
                        min={1}
                        max={999}
                        className='h-9 w-16'
                        value={repeat.end.count}
                        onChange={(e) => set({ end: { type: 'count', count: clampInt(e.target.value, 1, 999) } })}
                     />
                     times
                  </span>
               )}
            </div>
         )}
      </div>
   )
}
