import { useId, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { TagGroup } from './recipesApi'

const chip =
   'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50'

/** Predefined tags by group (tap to pick), plus the household's own tags (add, remove). */
export function TagPicker({ groups, value, onChange }: { groups: readonly TagGroup[]; value: string[]; onChange: (tags: string[]) => void }) {
   const id = useId()
   const [own, setOwn] = useState('')
   const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase())
   const toggle = (t: string) => onChange(has(t) ? value.filter((v) => v.toLowerCase() !== t.toLowerCase()) : [...value, t])
   const catalog = new Set(groups.flatMap((g) => g.tags.map((t) => t.toLowerCase())))
   const custom = value.filter((t) => !catalog.has(t.toLowerCase()))
   const addOwn = () => {
      const tag = own.trim().replace(/\s+/g, ' ')
      if (tag && !has(tag)) onChange([...value, tag])
      setOwn('')
   }

   return (
      <div className='space-y-4'>
         <p className='text-sm' aria-live='polite'>
            {value.length ? `${value.length} selected` : 'Tap the tags that fit.'}
         </p>
         {groups.map((g) => (
            <fieldset key={g.id} className='space-y-1.5'>
               <legend className='mb-1.5 text-xs font-semibold tracking-wide uppercase'>{g.label}</legend>
               <div className='flex flex-wrap gap-1.5'>
                  {g.tags.map((t) => {
                     const on = has(t)
                     return (
                        <button
                           key={t}
                           type='button'
                           aria-pressed={on}
                           onClick={() => toggle(t)}
                           className={cn(chip, on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
                        >
                           {on && <Check className='size-3.5' aria-hidden />}
                           {t}
                        </button>
                     )
                  })}
               </div>
            </fieldset>
         ))}
         <fieldset className='space-y-1.5'>
            <legend className='mb-1.5 text-xs font-semibold tracking-wide uppercase'>Your own</legend>
            {custom.length > 0 && (
               <div className='flex flex-wrap gap-1.5'>
                  {custom.map((t) => (
                     <button key={t} type='button' onClick={() => toggle(t)} className={cn(chip, 'border-primary bg-primary text-primary-foreground')} aria-label={`Remove tag ${t}`}>
                        {t}
                        <X className='size-3.5' aria-hidden />
                     </button>
                  ))}
               </div>
            )}
            <div className='flex max-w-sm gap-2'>
               <label htmlFor={`${id}-own`} className='sr-only'>
                  Add your own tag
               </label>
               <Input
                  id={`${id}-own`}
                  value={own}
                  maxLength={30}
                  placeholder='e.g. Omas Rezept'
                  className='h-8'
                  onChange={(e) => setOwn(e.target.value)}
                  onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                        e.preventDefault()
                        addOwn()
                     }
                  }}
               />
               <Button type='button' variant='outline' size='sm' className='h-8' onClick={addOwn} disabled={!own.trim()}>
                  <Plus />
                  Add
               </Button>
            </div>
         </fieldset>
      </div>
   )
}
