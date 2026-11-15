import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Member } from '@/features/households/householdsApi'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'
import { pressedClass } from './styles'

type MemberPickerProps = {
   labelId: string
   members: Member[]
   value: string[]
   onChange: (ids: string[]) => void
}

/** Toggle chips for household members; ids of people who left stay selectable to remove them. */
export function MemberPicker({ labelId, members, value, onChange }: MemberPickerProps) {
   const known = new Set(members.map((m) => m.id))
   const former = value.filter((id) => !known.has(id))
   return (
      <ToggleGroup
         multiple
         aria-labelledby={labelId}
         variant='outline'
         spacing={1}
         className='flex-wrap justify-start'
         value={value}
         onValueChange={(ids) => onChange(ids as string[])}
      >
         {members.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id} title={m.fullName} className={cn('h-9 gap-2 pr-3 pl-1', pressedClass)}>
               <Avatar className='size-7' aria-hidden>
                  <AvatarImage src={avatarSrc(m)} alt='' />
                  <AvatarFallback className='bg-muted text-[0.65rem] font-semibold text-foreground'>{initials(m)}</AvatarFallback>
               </Avatar>
               {m.fname}
            </ToggleGroupItem>
         ))}
         {former.map((id) => (
            <ToggleGroupItem key={id} value={id} className={cn('h-9 px-3 italic', pressedClass)}>
               Former member
            </ToggleGroupItem>
         ))}
      </ToggleGroup>
   )
}
