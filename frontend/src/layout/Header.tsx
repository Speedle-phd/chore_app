import { ModeToggle } from '@/components/mode-toggle'
import { NavLink, useLocation } from 'react-router-dom'
import { Flame } from 'lucide-react'
import Navigation from './Navigation'
import UserMenu from '@/features/auth/UserMenu'
import HouseholdSwitcher from '@/features/households/HouseholdSwitcher'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { hasUnread } from '@/features/pinboard/format'
import { usePosts } from '@/features/pinboard/pinboardApi'
import { useSeenAt } from '@/features/pinboard/seen'
import type { NavigationItem } from './AppLayout'

type HeaderProps = {
   navigationItems: NavigationItem[]
}

const Header = ({ navigationItems }: HeaderProps) => {
   const household = useHousehold()
   const posts = usePosts(household.id)
   const me = useMembers(household.id).data?.find((m) => m.isMe)
   const seenAt = useSeenAt(household.id)
   // A dot on the logo (the way home) when the pinboard has something new; not while looking at it.
   const onHome = useLocation().pathname === '/'
   const news = !onHome && Boolean(posts.data && me && hasUnread(posts.data, seenAt, me.id))
   return (
      <header className='sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl supports-backdrop-filter:bg-background/60'>
         <div className='mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6'>
            <NavLink
               to='/'
               end
               // The way home on desktop (no Home link); the word is hidden on phones.
               aria-label={news ? 'Hearth, home, new on the pinboard' : 'Hearth, home'}
               className='flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
            >
               <span className='relative grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30'>
                  <Flame className='size-5' />
                  {news && <span aria-hidden className='absolute -top-1 -right-1 size-3 rounded-full bg-destructive ring-2 ring-background' />}
               </span>
               <span className='hidden text-lg font-semibold tracking-tight sm:inline'>
                  Hearth
               </span>
            </NavLink>
            <span aria-hidden className='-mx-1 hidden h-5 w-px bg-border sm:block' />
            <HouseholdSwitcher items={navigationItems.filter((item) => item.place === 'household')} />

            <Navigation navigationItems={navigationItems} />

            <div className='ml-auto flex items-center gap-2 lg:ml-0'>
               <ModeToggle />
               <UserMenu />
            </div>
         </div>
      </header>
   )
}

export default Header
