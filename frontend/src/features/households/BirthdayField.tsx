import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { selectClass } from '@/features/calendar/styles'
import { cn } from '@/lib/utils'
import type { BirthdayParts } from './birthday'

const MONTHS = Array.from({ length: 12 }, (_, i) =>
   new Date(Date.UTC(2000, i, 15)).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' }),
)

type BirthdayFieldProps = {
   value: BirthdayParts
   onChange: (value: BirthdayParts) => void
   error?: string | undefined
}

/** Day, month and an optional year; empty = no birthday. */
export function BirthdayField({ value, onChange, error }: BirthdayFieldProps) {
   const id = useId()
   const set = (patch: Partial<BirthdayParts>) => onChange({ ...value, ...patch })
   return (
      <fieldset className='space-y-1.5' aria-describedby={`${id}-hint`}>
         <legend className='text-sm font-medium'>
            Birthday <span className='font-normal text-muted-foreground'>(optional)</span>
         </legend>
         <div className='flex flex-wrap gap-2'>
            <Input
               aria-label='Day'
               inputMode='numeric'
               placeholder='Day'
               className='h-10 w-20'
               value={value.day}
               aria-invalid={Boolean(error)}
               onChange={(e) => set({ day: e.target.value.replace(/\D/g, '').slice(0, 2) })}
            />
            <select
               aria-label='Month'
               className={cn(selectClass, 'h-10 w-40')}
               value={value.month}
               aria-invalid={Boolean(error)}
               onChange={(e) => set({ month: e.target.value })}
            >
               <option value=''>Month</option>
               {MONTHS.map((name, i) => (
                  <option key={name} value={String(i + 1)}>
                     {name}
                  </option>
               ))}
            </select>
            <Input
               aria-label='Year (optional)'
               inputMode='numeric'
               placeholder='Year'
               className='h-10 w-24'
               value={value.year}
               aria-invalid={Boolean(error)}
               onChange={(e) => set({ year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            />
         </div>
         <p id={`${id}-hint`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
            {error ?? 'Shown in the household calendar. The year is optional (it adds the age).'}
         </p>
      </fieldset>
   )
}
