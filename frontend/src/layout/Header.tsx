import { ModeToggle } from '@/components/mode-toggle'
import { NavLink } from 'react-router-dom'
import { Flame } from 'lucide-react'
import Navigation from './Navigation'
import UserMenu from '@/features/auth/UserMenu'
import HouseholdSwitcher from '@/features/households/HouseholdSwitcher'
import type { NavigationItem } from './AppLayout'

type HeaderProps = {
   navigationItems: NavigationItem[]
}

const Header = ({ navigationItems }: HeaderProps) => {
   return (
      <header className='sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl supports-backdrop-filter:bg-background/60'>
         <div className='mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6'>
            <NavLink
               to='/'
               className='flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
            >
               <span className='grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30'>
                  <Flame className='size-5' />
               </span>
               <span className='hidden text-lg font-semibold tracking-tight sm:inline'>
                  Hearth
               </span>
            </NavLink>
            <span aria-hidden className='-mx-1 hidden h-5 w-px bg-border sm:block' />
            <HouseholdSwitcher />

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
