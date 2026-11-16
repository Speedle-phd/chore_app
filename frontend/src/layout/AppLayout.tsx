import { Outlet } from 'react-router'
import Header from './Header'
import MainWrapper from './MainWrapper'
import { useHousehold } from '@/features/households/householdsApi'
import { useHouseholdRoom } from '@/features/realtime/useHouseholdRoom'
import { useSyncTimezone } from '@/features/account/useSyncTimezone'
import {
   Calendar,
   ChefHat,
   ClipboardCheck,
   Home,
   Settings,
   ShoppingCartPlus,
   UserGroup,
} from 'lucide-react'

const navigationItems = [
   {
      label: 'Hearth',
      href: '/',
      Icon: Home,
      subtitle: 'Your household at a glance',
   },
   {
      label: 'Calendar',
      href: '/calendar',
      Icon: Calendar,
      subtitle: 'Plan the week together',
   },
   {
      label: 'Chores',
      href: '/chores',
      Icon: ClipboardCheck,
      subtitle: 'Who does what, and when',
   },
   {
      label: 'Members',
      href: '/members',
      Icon: UserGroup,
      subtitle: 'The schnuffis who make this place schnuffelicious',
   },
   {
      label: 'Shopping',
      href: '/shopping-list',
      Icon: ShoppingCartPlus,
      subtitle: 'Never forget the milk again',
   },
   {
      label: 'Recipes',
      href: '/recipes',
      Icon: ChefHat,
      subtitle: 'What’s cooking, and what it needs',
   },
   {
      label: 'Settings',
      href: '/settings',
      Icon: Settings,
      subtitle: 'Make Hearth feel like home',
   },
]
export type NavigationItem = (typeof navigationItems)[0]

const AppLayout = () => {
   // Live updates for the household on screen.
   useHouseholdRoom(useHousehold().id)
   useSyncTimezone()
   return (
      <div className='flex min-h-dvh flex-col'>
         <Header navigationItems={navigationItems} />
         <MainWrapper>
            <Outlet context={{ navigationItems }} />
         </MainWrapper>
      </div>
   )
}

export default AppLayout
