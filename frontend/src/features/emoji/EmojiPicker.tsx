import { useId, useRef, useState, type RefObject } from 'react'
import { Search, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { addRecent, searchEmojis } from './emoji'
import { EMOJI_GROUPS, type Emoji } from './emojiData'

/** Emojis per row; arrow up/down move by this many. */
const COLUMNS = 8
const RECENT_KEY = 'emoji-recent'
const nameOf = new Map(EMOJI_GROUPS.flatMap((g) => g.emojis.map((x) => [x.char, x.name] as const)))

function readRecent(): string[] {
   try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string' && nameOf.has(c)) : []
   } catch {
      return [] // storage blocked or broken: just no "recently used"
   }
}
function saveRecent(chars: string[]) {
   try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(chars))
   } catch {
      // A per-device convenience; nothing else depends on it.
   }
}

/** Search + groups of emojis; one tab stop for the grid, arrows move inside it. */
export function EmojiPanel({ onPick }: { onPick: (char: string) => void }) {
   const id = useId()
   const [query, setQuery] = useState('')
   const [recent, setRecent] = useState(readRecent)
   const [active, setActive] = useState(0)
   const buttons = useRef<(HTMLButtonElement | null)[]>([])

   const groups = [
      ...(query.trim() || !recent.length ? [] : [{ id: 'recent', label: 'Recently used', emojis: recent.map((char): Emoji => ({ char, name: nameOf.get(char) ?? char })) }]),
      ...searchEmojis(query),
   ]
   const flat = groups.flatMap((g) => g.emojis)
   const current = Math.min(active, Math.max(flat.length - 1, 0))

   const pick = (char: string) => {
      const next = addRecent(recent, char)
      setRecent(next)
      saveRecent(next)
      onPick(char)
   }
   const move = (to: number) => {
      const i = Math.max(0, Math.min(flat.length - 1, to))
      setActive(i)
      buttons.current[i]?.focus()
   }
   const onGridKey = (e: React.KeyboardEvent) => {
      const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }
      if (e.key in keys) {
         e.preventDefault()
         move(current + (keys[e.key] ?? 0))
      } else if (e.key === 'Home') {
         e.preventDefault()
         move(0)
      } else if (e.key === 'End') {
         e.preventDefault()
         move(flat.length - 1)
      }
   }

   let index = -1
   return (
      <div className='w-72 space-y-2'>
         <div className='relative'>
            <label htmlFor={`${id}-search`} className='sr-only'>
               Search emojis
            </label>
            <Search aria-hidden className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
               id={`${id}-search`}
               type='search'
               value={query}
               autoComplete='off'
               placeholder='Search, e.g. pizza'
               className='h-8 ps-8'
               onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
               }}
               onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                     e.preventDefault()
                     move(current)
                  } else if (e.key === 'Enter' && flat[0]) {
                     e.preventDefault()
                     pick(flat[0].char)
                  }
               }}
            />
         </div>
         <p role='status' className='sr-only'>
            {query.trim() ? `${flat.length} ${flat.length === 1 ? 'emoji' : 'emojis'} found` : ''}
         </p>
         <div className='max-h-64 space-y-2 overflow-y-auto pe-1 scrollbar-slim' onKeyDown={onGridKey}>
            {flat.length === 0 && <p className='py-4 text-center text-sm text-muted-foreground'>No emoji matches “{query.trim()}”.</p>}
            {groups.map((g) => (
               <section key={g.id} aria-labelledby={`${id}-${g.id}`}>
                  <h3 id={`${id}-${g.id}`} className='mb-1 text-xs font-medium text-muted-foreground'>
                     {g.label}
                  </h3>
                  <div className='grid grid-cols-8'>
                     {g.emojis.map((x) => {
                        index++
                        const i = index
                        return (
                           <button
                              key={`${g.id}-${x.char}`}
                              ref={(el) => {
                                 buttons.current[i] = el
                              }}
                              type='button'
                              tabIndex={i === current ? 0 : -1}
                              aria-label={x.name}
                              title={x.name}
                              onFocus={() => setActive(i)}
                              onClick={() => pick(x.char)}
                              className='grid size-8 place-items-center rounded-md text-xl leading-none outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
                           >
                              {x.char}
                           </button>
                        )
                     })}
                  </div>
               </section>
            ))}
         </div>
      </div>
   )
}

/**
 * A smiley button that opens the emoji panel; picking closes it. With `field`, focus goes back into
 * that text field after a pick (Escape still returns to the button).
 */
export function EmojiPicker({
   onPick,
   label = 'Add an emoji',
   side = 'bottom',
   className,
   field,
}: {
   onPick: (char: string) => void
   field?: RefObject<HTMLElement | null>
   label?: string
   side?: 'top' | 'bottom'
   className?: string
}) {
   const [open, setOpen] = useState(false)
   const picked = useRef(false)
   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            if (next) picked.current = false
            setOpen(next)
         }}
      >
         <PopoverTrigger
            render={
               <Button type='button' variant='ghost' size='icon' aria-label={label} className={cn('shrink-0 text-muted-foreground', className)}>
                  <Smile />
               </Button>
            }
         />
         <PopoverContent side={side} align='start' className='p-2' finalFocus={() => (picked.current && field?.current ? field.current : true)}>
            {/* Mounted per opening, so search and position start fresh. */}
            {open && <EmojiPanel
               onPick={(char) => {
                  picked.current = true
                  onPick(char)
                  setOpen(false)
               }}
            />}
         </PopoverContent>
      </Popover>
   )
}
