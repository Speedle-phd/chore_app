import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Member } from '@/features/households/householdsApi'
import { EmojiPanel } from '@/features/emoji/EmojiPicker'
import { QUICK_REACTIONS } from '@/features/emoji/emojiData'
import { cn } from '@/lib/utils'
import { useReact, type ChatMessage } from './chatApi'

const names = (ids: string[], members: Member[], myId: string | undefined) =>
   ids.map((id) => (id === myId ? 'you' : (members.find((m) => m.id === id)?.fname ?? 'someone who left'))).join(', ')

/**
 * The reactions on a message's bottom edge (outer side), tap one to join or take yours back.
 * The bubble has extra bottom padding for them; the card-coloured ring sets them off from it.
 */
export function ReactionChips({
   householdId,
   message,
   members,
   myId,
   mine,
}: {
   householdId: string
   message: ChatMessage
   members: Member[]
   myId: string | undefined
   mine: boolean
}) {
   const react = useReact(householdId, myId)
   if (!message.reactions.length) return null
   return (
      <ul className={cn('relative -mt-3 mb-1 flex flex-wrap gap-1 px-2', mine && 'justify-end')} aria-label='Reactions'>
         {message.reactions.map((r) => {
            const pressed = Boolean(myId && r.memberIds.includes(myId))
            const who = names(r.memberIds, members, myId)
            return (
               <li key={r.emoji}>
                  <button
                     type='button'
                     aria-pressed={pressed}
                     title={who}
                     onClick={() => react.mutate({ id: message.id, emoji: r.emoji }, { onError: (e) => toast.error(apiError(e).message) })}
                     className={cn(
                        // Opaque backgrounds only: the chip covers the bubble's edge.
                        'inline-flex h-7 min-w-7 items-center gap-1 rounded-full border px-2 text-sm ring-2 ring-card outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring',
                        pressed ? 'border-primary bg-[color-mix(in_oklab,var(--primary)_14%,var(--card))] font-semibold' : 'bg-card hover:bg-muted',
                     )}
                  >
                     <span aria-hidden>{r.emoji}</span>
                     <span aria-hidden className='text-xs tabular-nums'>
                        {r.count}
                     </span>
                     <span className='sr-only'>
                        {r.emoji} {r.count}: {who}
                     </span>
                  </button>
               </li>
            )
         })}
      </ul>
   )
}

/** "Add a reaction": the usual six, or any emoji from the full panel. */
export function AddReaction({ householdId, message, myId, label }: { householdId: string; message: ChatMessage; myId: string | undefined; label: string }) {
   const react = useReact(householdId, myId)
   const [open, setOpen] = useState(false)
   const [more, setMore] = useState(false)
   const pick = (emoji: string) => {
      react.mutate({ id: message.id, emoji }, { onError: (e) => toast.error(apiError(e).message) })
      setOpen(false)
   }
   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            setOpen(next)
            if (!next) setMore(false)
         }}
      >
         <PopoverTrigger
            render={
               <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={label}
                  className='shrink-0 self-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-60'
               />
            }
         >
            <SmilePlus />
         </PopoverTrigger>
         <PopoverContent side='top' align='center' className='p-1.5'>
            {more ? (
               <EmojiPanel onPick={pick} />
            ) : (
               <div role='group' aria-label='Quick reactions' className='flex items-center gap-0.5'>
                  {QUICK_REACTIONS.map((r) => (
                     <button
                        key={r.char}
                        type='button'
                        aria-label={r.name}
                        title={r.name}
                        onClick={() => pick(r.char)}
                        className='grid size-9 place-items-center rounded-full text-xl outline-none transition-transform hover:scale-110 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100'
                     >
                        {r.char}
                     </button>
                  ))}
                  <Button type='button' variant='ghost' size='sm' className='ms-1 text-xs' onClick={() => setMore(true)}>
                     More emojis
                  </Button>
               </div>
            )}
         </PopoverContent>
      </Popover>
   )
}
