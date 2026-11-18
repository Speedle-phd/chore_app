import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ListChecks, StickyNote, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { selectClass } from '@/features/calendar/styles'
import { EmojiPicker } from '@/features/emoji/EmojiPicker'
import { useInsertEmoji } from '@/features/emoji/useInsertEmoji'
import { cn } from '@/lib/utils'
import { EXPIRY_OPTIONS } from './format'
import { useCreatePost, type ExpiryPreset } from './pinboardApi'
import { cleanOptions, editOption, moveOption, removeOption } from './pollDraft'

/** Same limit as the server (domain/pinboard.ts). */
const MIN_OPTIONS = 2

const CLOSE_OPTIONS: { value: ExpiryPreset; label: string }[] = [
   { value: 'never', label: 'when someone closes it' },
   { value: 'day', label: 'after a day' },
   { value: '3days', label: 'after 3 days' },
   { value: 'week', label: 'after a week' },
]

/** Two-way switch as a group of pressed buttons (e.g. One answer | Several). */
function Choice<T extends string | boolean>({
   label,
   value,
   options,
   onChange,
}: {
   label: string
   value: T
   options: { value: T; label: string }[]
   onChange: (value: T) => void
}) {
   const id = useId()
   return (
      <div className='flex flex-wrap items-center gap-2 text-sm'>
         <span id={id}>{label}</span>
         <div role='group' aria-labelledby={id} className='inline-flex gap-0.5 rounded-lg bg-muted p-0.5'>
            {options.map((o) => (
               <button
                  key={String(o.value)}
                  type='button'
                  aria-pressed={value === o.value}
                  onClick={() => onChange(o.value)}
                  className={cn(
                     'h-7 rounded-md px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                     value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
               >
                  {o.label}
               </button>
            ))}
         </div>
      </div>
   )
}

/** Write a note or ask a poll question. */
export function Composer({ householdId }: { householdId: string }) {
   const id = useId()
   const create = useCreatePost(householdId)
   const [kind, setKind] = useState<'note' | 'poll'>('note')
   const [text, setText] = useState('')
   const [options, setOptions] = useState(['', ''])
   const [multiple, setMultiple] = useState(false)
   const [resultsAfterVote, setResultsAfterVote] = useState(false)
   const [expiry, setExpiry] = useState<ExpiryPreset>('week')
   const [closes, setCloses] = useState<ExpiryPreset>('never')
   const [problem, setProblem] = useState<string | null>(null)
   const inputs = useRef<(HTMLInputElement | null)[]>([])
   // The note or question field (only one is shown), for inserting emojis at the caret.
   const textField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
   const insertEmoji = useInsertEmoji(textField, text, setText)
   // A field that changes place (moved, removed) gets focus after the list has re-rendered.
   const pendingFocus = useRef<number | null>(null)
   useEffect(() => {
      if (pendingFocus.current === null) return
      inputs.current[pendingFocus.current]?.focus()
      pendingFocus.current = null
   }, [options])
   const focusLater = (i: number) => {
      pendingFocus.current = i
   }

   const filled = cleanOptions(options)
   const reset = () => {
      setText('')
      setOptions(['', ''])
      setMultiple(false)
      setResultsAfterVote(false)
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
      create.mutate(
         kind === 'note' ? { kind, text: text.trim(), expiry } : { kind, text: text.trim(), options: filled, multiple, resultsAfterVote, expiry, closes },
         {
            onSuccess: () => {
               reset()
               toast.success(kind === 'note' ? 'Posted' : 'Poll posted')
            },
            onError: (err) => setProblem(apiError(err).message),
         },
      )
   }

   const optionKeys = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
         // Enter moves on (the empty last field is always there while there's room), never submits.
         e.preventDefault()
         inputs.current[i + 1]?.focus()
      } else if (e.key === 'Backspace' && options[i] === '' && options.length > MIN_OPTIONS && i > 0) {
         e.preventDefault()
         focusLater(i - 1)
         setOptions(removeOption(options, i))
      }
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
                  ref={(el) => {
                     textField.current = el
                  }}
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
                  ref={(el) => {
                     textField.current = el
                  }}
                  id={`${id}-text`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                        e.preventDefault()
                        inputs.current[0]?.focus()
                     }
                  }}
                  maxLength={300}
                  placeholder='Your question, e.g. “Pizza or pasta on Friday?”'
                  aria-describedby={problem ? `${id}-problem` : undefined}
               />
            )}
         </div>

         {kind === 'poll' && (
            <fieldset className='space-y-2'>
               <legend className='mb-1 text-sm font-medium'>Options</legend>
               <p id={`${id}-option-hint`} className='text-xs text-muted-foreground'>
                  Enter goes to the next option; a new one appears as you type.
               </p>
               <ol className='space-y-1.5'>
                  {options.map((option, i) => {
                     const isDraft = option === '' && i === options.length - 1 && i >= MIN_OPTIONS
                     const movable = option.trim() !== ''
                     return (
                        <li key={i} className='flex items-center gap-1.5'>
                           <span aria-hidden className='w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums'>
                              {i + 1}.
                           </span>
                           <label htmlFor={`${id}-option-${i}`} className='sr-only'>
                              Option {i + 1}
                           </label>
                           <Input
                              ref={(el) => {
                                 inputs.current[i] = el
                              }}
                              id={`${id}-option-${i}`}
                              value={option}
                              maxLength={100}
                              placeholder={isDraft ? 'Add an option' : `Option ${i + 1}`}
                              aria-describedby={i === 0 ? `${id}-option-hint` : undefined}
                              onChange={(e) => setOptions(editOption(options, i, e.target.value))}
                              onKeyDown={optionKeys(i)}
                              className={cn(isDraft && 'border-dashed')}
                           />
                           <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`Move option ${i + 1} up`}
                              disabled={!movable || i === 0}
                              onClick={() => {
                                 focusLater(i - 1)
                                 setOptions(moveOption(options, i, -1))
                              }}
                           >
                              <ArrowUp />
                           </Button>
                           <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`Move option ${i + 1} down`}
                              disabled={!movable || i + 1 >= cleanOptions(options).length}
                              onClick={() => {
                                 focusLater(i + 1)
                                 setOptions(moveOption(options, i, 1))
                              }}
                           >
                              <ArrowDown />
                           </Button>
                           <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`Remove option ${i + 1}`}
                              disabled={options.length <= MIN_OPTIONS || isDraft}
                              onClick={() => setOptions(removeOption(options, i))}
                           >
                              <X />
                           </Button>
                        </li>
                     )
                  })}
               </ol>
               <div className='flex flex-wrap gap-x-5 gap-y-2 pt-1'>
                  <Choice
                     label='Answers'
                     value={multiple}
                     onChange={setMultiple}
                     options={[
                        { value: false, label: 'One' },
                        { value: true, label: 'Several' },
                     ]}
                  />
                  <Choice
                     label='Results'
                     value={resultsAfterVote}
                     onChange={setResultsAfterVote}
                     options={[
                        { value: false, label: 'Right away' },
                        { value: true, label: 'After voting' },
                     ]}
                  />
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
               <EmojiPicker onPick={insertEmoji} field={textField} label={kind === 'note' ? 'Add an emoji to the note' : 'Add an emoji to the question'} className='-ms-1' />
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
