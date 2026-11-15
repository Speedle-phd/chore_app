import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Member } from '@/features/households/householdsApi'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'

type AvatarStackProps = {
   people: Member[]
   /** xs for tight event chips, sm elsewhere. */
   size?: 'xs' | 'sm'
   max?: number
   className?: string
}

const SIZE = { xs: 'size-[1.125rem]', sm: 'size-6' } as const
/** The fallback sets its own text size, so initials are sized there. */
const TEXT = { xs: 'text-[0.5rem]', sm: 'text-[0.5625rem]' } as const

/** Overlapping avatars of the people assigned; the names are the accessible label. */
export function AvatarStack({ people, size = 'sm', max = 3, className }: AvatarStackProps) {
   if (!people.length) return null
   const shown = people.slice(0, max)
   const extra = people.length - shown.length
   return (
      <span
         role='img'
         aria-label={people.map((p) => p.fullName).join(', ')}
         title={people.map((p) => p.fullName).join(', ')}
         className={cn('flex shrink-0 items-center -space-x-1', className)}
      >
         {shown.map((p) => (
            <Avatar key={p.id} className={cn(SIZE[size], 'ring-[1.5px] ring-background')} aria-hidden>
               <AvatarImage src={avatarSrc(p)} alt='' />
               <AvatarFallback className={cn(TEXT[size], 'bg-muted font-semibold tracking-tighter text-foreground')}>{initials(p)}</AvatarFallback>
            </Avatar>
         ))}
         {extra > 0 && (
            <span
               aria-hidden
               className={cn(SIZE[size], TEXT[size], 'grid place-items-center rounded-full bg-muted font-semibold text-foreground ring-[1.5px] ring-background')}
            >
               +{extra}
            </span>
         )}
      </span>
   )
}
