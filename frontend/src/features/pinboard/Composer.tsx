import { useId, useState } from 'react'
import { ListChecks, Plus, StickyNote, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { selectClass } from '@/features/calendar/styles'
import { cn } from '@/lib/utils'
import { EXPIRY_OPTIONS } from './format'
import { useCreatePost, type ExpiryPreset } from './pinboardApi'

/** Same limits as the server (domain/pinboard.ts). */
const MIN_OPTIONS = 2
const MAX_OPTIONS = 10

const CLOSE_OPTIONS: { value: ExpiryPreset; label: string }[] = [
   { value: 'never', label: 'when someone closes it' },
   { value: 'day', label: 'after a day' },
   { value: '3days', label: 'after 3 days' },
   { value: 'week', label: 'after a week' },
]

/** Write a note or ask a poll question. */
export function Composer({ householdId }: { householdId: string }) {
   const id = useId()
   const create = useCreatePost(householdId)
   const [kind, setKind] = useState<'note' | 'poll'>('note')
   const [text, setText] = useState('')
   const [options, setOptions] = useState(['', ''])
   const [multiple, setMultiple] = useState(false)
   const [expiry, setExpiry] = useState<ExpiryPreset>('week')
   const [closes, setCloses] = useState<ExpiryPreset>('never')
   const [problem, setProblem] = useState<string | null>(null)

   const filled = options.map((o) => o.trim()).filter(Boolean)
   const reset = () => {
      setText('')
      setOptions(['', ''])
      setMultiple(false)
      setProblem(null)
   }

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!text.trim()) return setProblem(kind === 'note' ? 'Write something first.' : 'Ask a question first.')
      if (kind === 'poll') {
         if (filled.length < MIN_OPTIONS) return setProblem(`Give at least ${MIN_OPTIONS} options.`)
         if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) return setProblem('Each option only once.')
      }
      setProblem(null)
      create.mutate(kind === 'note' ? { kind, text: text.trim(), expiry } : { kind, text: text.trim(), options: filled, multiple, expiry, closes }, {
         onSuccess: () => {
            reset()
            toast.success(kind === 'note' ? 'Posted' : 'Poll posted')
         },
         onError: (err) => setProblem(apiError(err).message),
      })
   }

   const kindButton = (value: 'note' | 'poll', label: string, Icon: typeof StickyNote) => (
      <button
         type='button'
         aria-pressed={kind === value}
         onClick={() => {
            setKind(value)
            setProblem(null)
         }}
         className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
            kind === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
         )}
      >
         <Icon className='size-4' aria-hidden />
         {label}
      </button>
   )

   return (
      <form onSubmit={submit} noValidate className='space-y-3 rounded-2xl border bg-card p-4' aria-label='New post'>
         <div role='group' aria-label='What to post' className='inline-flex gap-1 rounded-xl bg-muted p-1'>
            {kindButton('note', 'Note', StickyNote)}
            {kindButton('poll', 'Poll', ListChecks)}
         </div>

         <div>
            <label htmlFor={`${id}-text`} className='sr-only'>
               {kind === 'note' ? 'Note' : 'Question'}
            </label>
            {kind === 'note' ? (
               <Textarea
                  id={`${id}-text`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder='Something for everyone, e.g. “Plumber comes Tuesday at 9”'
                  aria-describedby={problem ? `${id}-problem` : undefined}
               />
            ) : (
               <Input
                  id={`${id}-text`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={300}
                  placeholder='Your question, e.g. “Pizza or pasta on Friday?”'
                  aria-describedby={problem ? `${id}-problem` : undefined}
               />
            )}
         </div>

         {kind === 'poll' && (
            <fieldset className='space-y-2'>
               <legend className='mb-1 text-sm font-medium'>Options</legend>
               {options.map((option, i) => (
                  <div key={i} className='flex gap-2'>
                     <label htmlFor={`${id}-option-${i}`} className='sr-only'>
                        Option {i + 1}
                     </label>
                     <Input
                        id={`${id}-option-${i}`}
                        value={option}
                        maxLength={100}
                        placeholder={`Option ${i + 1}`}
                        onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                     />
                     {options.length > MIN_OPTIONS && (
                        <Button type='button' variant='ghost' size='icon' aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                           <X />
                        </Button>
                     )}
                  </div>
               ))}
               <div className='flex flex-wrap items-center justify-between gap-2'>
                  {options.length < MAX_OPTIONS ? (
                     <Button type='button' variant='ghost' size='sm' onClick={() => setOptions([...options, ''])}>
                        <Plus />
                        Add option
                     </Button>
                  ) : (
                     <span className='text-xs text-muted-foreground'>At most {MAX_OPTIONS} options.</span>
                  )}
                  <label className='flex cursor-pointer items-center gap-2 text-sm'>
                     <Checkbox checked={multiple} onCheckedChange={setMultiple} />
                     People can pick several
                  </label>
               </div>
            </fieldset>
         )}

         {problem && (
            <p id={`${id}-problem`} role='alert' className='text-sm text-destructive'>
               {problem}
            </p>
         )}

         <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
               <label className='flex items-center gap-2'>
                  Show for
                  <select className={cn(selectClass, 'w-auto')} value={expiry} onChange={(e) => setExpiry(e.target.value as ExpiryPreset)}>
                     {EXPIRY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                           {o.label}
                        </option>
                     ))}
                  </select>
               </label>
               {kind === 'poll' && (
                  <label className='flex items-center gap-2'>
                     Voting ends
                     <select className={cn(selectClass, 'w-auto')} value={closes} onChange={(e) => setCloses(e.target.value as ExpiryPreset)}>
                        {CLOSE_OPTIONS.map((o) => (
                           <option key={o.value} value={o.value}>
                              {o.label}
                           </option>
                        ))}
                     </select>
                  </label>
               )}
            </div>
            <Button type='submit' disabled={create.isPending}>
               {create.isPending ? 'Posting…' : kind === 'note' ? 'Post' : 'Post poll'}
            </Button>
         </div>
      </form>
   )
}
