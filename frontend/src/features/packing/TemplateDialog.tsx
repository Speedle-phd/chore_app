import { useId, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import { selectClass } from '@/features/calendar/styles'
import { cn } from '@/lib/utils'
import { formatAmount, parseAmount } from './amounts'
import { useSaveTemplate, type PackingTemplate, type TemplateItem } from './packingApi'
import { SECTION_IDS, SECTIONS, type PackingSection } from './sections'

/** A row as typed: amounts stay text until saved, so "1," or "½" can be typed. */
type Row = { key: number; text: string; section: PackingSection; perPerson: boolean; amount: string; perDay: boolean; max: string }

/** Stable React keys for rows (texts can repeat or be empty). */
let lastKey = 0
const toRow = (item: TemplateItem): Row => ({
   key: ++lastKey,
   text: item.text,
   section: item.section,
   perPerson: item.perPerson,
   amount: item.amount === null ? '' : formatAmount(item.amount),
   perDay: item.perDay,
   max: item.maxAmount === null ? '' : String(item.maxAmount),
})

/** The row as an item, or the reason it can't be saved. */
function parseRow(row: Row): { item: TemplateItem } | { error: string } {
   const amount = parseAmount(row.amount, { halves: row.perDay })
   if (amount === undefined) return { error: row.perDay ? 'Use a number above 0, halves allowed (½).' : 'Use a whole number above 0.' }
   const perDay = row.perDay && amount !== null
   const max = perDay ? parseAmount(row.max) : null
   if (max === undefined) return { error: '“At most” takes a whole number above 0.' }
   return { item: { text: row.text.trim(), section: row.section, perPerson: row.perPerson, amount, perDay, maxAmount: max } }
}

const smallLabel = 'text-xs text-muted-foreground'

/** Create or edit a template: a name and items (text, section, amount, once per person or shared). */
export function TemplateDialog({ householdId, template, onClose }: { householdId: string; template: PackingTemplate | null; onClose: () => void }) {
   const id = useId()
   const save = useSaveTemplate(householdId)
   const [name, setName] = useState(template?.name ?? '')
   const [rows, setRows] = useState<Row[]>(() => (template?.items ?? []).map(toRow))
   const listRef = useRef<HTMLUListElement>(null)

   const update = (key: number, change: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)))
   const addRow = () => {
      const section = rows.at(-1)?.section ?? 'clothes'
      setRows((all) => [...all, toRow({ text: '', section, perPerson: false, amount: null, perDay: false, maxAmount: null })])
      // Focus the new row's text once it exists.
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>('li:last-child input[type="text"]')?.focus())
   }
   const filled = rows.filter((r) => r.text.trim())
   const parsed = filled.map(parseRow)
   const valid = name.trim().length > 0 && parsed.every((p) => 'item' in p)

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!valid) return
      const items = parsed.flatMap((p) => ('item' in p ? [p.item] : []))
      save.mutate({ id: template?.id ?? null, input: { name: name.trim(), items } }, { onSuccess: onClose })
   }

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='flex max-h-[92dvh] flex-col sm:max-w-2xl'>
            <DialogHeader>
               <DialogTitle>{template ? 'Edit template' : 'New template'}</DialogTitle>
               <DialogDescription>
                  Lists made from it get these items. Amounts are optional; “a day” is multiplied by the length of the trip.
               </DialogDescription>
            </DialogHeader>
            <form id={`${id}-form`} onSubmit={submit} noValidate className='scrollbar-slim -mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1'>
               {save.isError && <FormAlert tone='error' error={apiError(save.error)} />}
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-name`} className='text-sm font-medium'>
                     Name
                  </label>
                  <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder='e.g. Camping' />
               </div>
               <fieldset className='space-y-2'>
                  <legend className='mb-1.5 text-sm font-medium'>Items ({filled.length})</legend>
                  <ul ref={listRef} className='space-y-2'>
                     {rows.map((row, index) => {
                        const n = index + 1
                        const result = row.text.trim() ? parseRow(row) : null
                        const error = result && 'error' in result ? result.error : null
                        const errorId = `${id}-row-${row.key}-error`
                        return (
                           <li key={row.key} className='space-y-2 rounded-xl border p-2'>
                              {/* One wrapping row. Phone: name + remove, then section and amount. Wider: name, section, remove, then amount. */}
                              <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                                 <Input
                                    type='text'
                                    aria-label={`Item ${n}`}
                                    value={row.text}
                                    onChange={(e) => update(row.key, { text: e.target.value })}
                                    maxLength={100}
                                    className='order-1 h-9 min-w-0 flex-1 basis-[calc(100%-2.75rem)] sm:basis-0'
                                    placeholder='e.g. Sleeping bag'
                                 />
                                 {/* No fixed width: a native select is as wide as its longest option. */}
                                 <select
                                    aria-label={`Section of item ${n}`}
                                    className={cn(selectClass, 'order-3 w-auto shrink-0 sm:order-2')}
                                    value={row.section}
                                    onChange={(e) => update(row.key, { section: e.target.value as PackingSection })}
                                 >
                                    {SECTION_IDS.map((s) => (
                                       <option key={s} value={s}>
                                          {SECTIONS[s].label}
                                       </option>
                                    ))}
                                 </select>
                                 <Button
                                    type='button'
                                    variant='ghost'
                                    size='icon'
                                    className='order-2 shrink-0 sm:order-3'
                                    aria-label={`Remove ${row.text.trim() || `item ${n}`}`}
                                    onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                                 >
                                    <X />
                                 </Button>
                                 <span aria-hidden className='order-4 hidden basis-full sm:block' />
                                 <label className={cn(smallLabel, 'order-5 flex items-center gap-1.5')}>
                                    Amount
                                    <Input
                                       aria-label={`Amount of item ${n}`}
                                       inputMode='decimal'
                                       value={row.amount}
                                       onChange={(e) => update(row.key, { amount: e.target.value })}
                                       placeholder='–'
                                       className='h-8 w-14 text-center'
                                       aria-invalid={Boolean(error) || undefined}
                                       aria-describedby={error ? errorId : undefined}
                                    />
                                 </label>
                                 <select
                                    aria-label={`How the amount of item ${n} counts`}
                                    className={cn(selectClass, 'order-5 h-8 w-auto')}
                                    value={row.perDay ? 'day' : 'total'}
                                    onChange={(e) => update(row.key, { perDay: e.target.value === 'day' })}
                                    disabled={!row.amount.trim()}
                                 >
                                    <option value='total'>in total</option>
                                    <option value='day'>a day</option>
                                 </select>
                                 {row.perDay && row.amount.trim() && (
                                    <label className={cn(smallLabel, 'order-5 flex items-center gap-1.5')}>
                                       at most
                                       <Input
                                          aria-label={`At most, item ${n}`}
                                          inputMode='numeric'
                                          value={row.max}
                                          onChange={(e) => update(row.key, { max: e.target.value })}
                                          placeholder='–'
                                          className='h-8 w-14 text-center'
                                       />
                                    </label>
                                 )}
                                 <label className='order-5 ms-auto flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap'>
                                    <Checkbox checked={row.perPerson} onCheckedChange={(on) => update(row.key, { perPerson: on })} />
                                    Each person
                                 </label>
                              </div>
                              {error && (
                                 <p id={errorId} className='text-xs text-destructive'>
                                    {error}
                                 </p>
                              )}
                           </li>
                        )
                     })}
                  </ul>
                  <Button type='button' variant='outline' size='sm' onClick={addRow}>
                     <Plus />
                     Add item
                  </Button>
               </fieldset>
            </form>
            <DialogFooter>
               <Button type='button' variant='ghost' onClick={onClose}>
                  Cancel
               </Button>
               <Button type='submit' form={`${id}-form`} size='lg' className='px-4' disabled={!valid || save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save template'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
