import { useId } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { pressedClass } from '@/features/calendar/styles'
import type { Member } from '@/features/households/householdsApi'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'

type PeopleFilterProps = {
   members: Member[]
   /** Selected membership ids; none = everyone. */
   value: string[]
   onChange: (memberIds: string[]) => void
}

/** "People" chips (avatar + first name), several at once; nothing selected means everyone. */
export function PeopleFilter({ members, value, onChange }: PeopleFilterProps) {
   const labelId = useId()
   return (
      <div className='flex flex-wrap items-center gap-2'>
         {/* Full-contrast text: the muted token is 4.41:1 in the light theme. */}
         <span id={labelId} className='text-sm font-medium'>
            People
         </span>
         <ToggleGroup
            multiple
            aria-labelledby={labelId}
            variant='outline'
            spacing={1}
            className='flex-wrap'
            value={value}
            onValueChange={(ids) => onChange(ids as string[])}
         >
            {members.map((m) => (
               <ToggleGroupItem key={m.id} value={m.id} title={m.fullName} className={cn('h-8 gap-1.5 pr-2.5 pl-1', pressedClass)}>
                  <Avatar className='size-6' aria-hidden>
                     <AvatarImage src={avatarSrc(m)} alt='' />
                     <AvatarFallback className='bg-muted text-[0.5625rem] font-semibold text-foreground'>{initials(m)}</AvatarFallback>
                  </Avatar>
                  {m.isMe ? `${m.fname} (you)` : m.fname}
               </ToggleGroupItem>
            ))}
         </ToggleGroup>
         {value.length === 0 && <span className='text-sm'>(everyone)</span>}
      </div>
   )
}
