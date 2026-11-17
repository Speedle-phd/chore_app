import { useId, useState } from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { ChoreTemplate } from './choreTemplates'
import { describeTemplate, searchTemplates } from './templates'

type TemplatePickerProps = {
   open: boolean
   onOpenChange: (open: boolean) => void
   onPick: (template: ChoreTemplate) => void
}

/** Searchable list of chore templates by group; picking one closes the dialog. */
export function TemplatePicker({ open, onOpenChange, onPick }: TemplatePickerProps) {
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className='flex max-h-[88dvh] flex-col gap-4 sm:max-w-xl'>
            <DialogHeader>
               <DialogTitle>Start from a template</DialogTitle>
               <DialogDescription>It fills in the chore; you can change everything before saving.</DialogDescription>
            </DialogHeader>
            {/* Remounted per opening, so the search starts empty. */}
            {open && <TemplateList onPick={onPick} />}
         </DialogContent>
      </Dialog>
   )
}

function TemplateList({ onPick }: { onPick: (template: ChoreTemplate) => void }) {
   const id = useId()
   const [query, setQuery] = useState('')
   const groups = searchTemplates(query)
   const count = groups.reduce((n, g) => n + g.templates.length, 0)

   return (
      <>
         <div className='relative'>
            <label htmlFor={`${id}-search`} className='sr-only'>
               Search templates
            </label>
            <Search aria-hidden className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
               id={`${id}-search`}
               type='search'
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               placeholder='e.g. descale, plants, tyres'
               autoComplete='off'
               className='h-9 ps-8'
            />
         </div>
         <p role='status' className='sr-only'>
            {query.trim() ? `${count} ${count === 1 ? 'template' : 'templates'} found` : ''}
         </p>
         <div className='-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1 scrollbar-slim'>
            {groups.length === 0 && (
               <p className='py-6 text-center text-sm text-muted-foreground'>No template matches “{query.trim()}”.</p>
            )}
            {groups.map((group) => (
               <section key={group.id} aria-labelledby={`${id}-${group.id}`}>
                  <h3 id={`${id}-${group.id}`} className='mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
                     {group.label}
                  </h3>
                  <ul className='grid gap-1.5 sm:grid-cols-2'>
                     {group.templates.map((t) => (
                        <li key={t.id}>
                           <button
                              type='button'
                              onClick={() => onPick(t)}
                              className='flex h-full w-full flex-col items-start gap-0.5 rounded-lg border bg-card px-3 py-2 text-left outline-none transition-colors hover:border-primary/50 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
                           >
                              <span className='text-sm font-medium'>{t.title}</span>
                              <span className='text-xs text-muted-foreground'>
                                 {describeTemplate(t)} · effort {t.effort}
                              </span>
                           </button>
                        </li>
                     ))}
                  </ul>
               </section>
            ))}
         </div>
      </>
   )
}
