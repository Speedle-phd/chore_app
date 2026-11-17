import { Outlet } from 'react-router'
import type { NavigationItem } from '@/types/types'
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
   Luggage,
   Settings,
   ShoppingCartPlus,
   UserGroup,
} from 'lucide-react'

const navigationItems: NavigationItem[] = [
   {
      label: 'Hearth',
      href: '/',
      Icon: Home,
      subtitle: 'Your household at a glance',
      place: 'logo',
   },
   {
      label: 'Calendar',
      href: '/calendar',
      Icon: Calendar,
      subtitle: 'Plan the week together',
      place: 'main',
   },
   {
      label: 'Chores',
      href: '/chores',
      Icon: ClipboardCheck,
      subtitle: 'Who does what, and when',
      place: 'main',
   },
   {
      label: 'Members',
      href: '/members',
      Icon: UserGroup,
      subtitle: 'The schnuffis who make this place schnuffelicious',
      place: 'household',
   },
   {
      label: 'Shopping',
      href: '/shopping-list',
      Icon: ShoppingCartPlus,
      subtitle: 'Never forget the milk again',
      place: 'main',
   },
   {
      label: 'Recipes',
      href: '/recipes',
      Icon: ChefHat,
      subtitle: 'What’s cooking, and what it needs',
      place: 'main',
   },
   {
      label: 'Packing',
      href: '/packing',
      Icon: Luggage,
      subtitle: 'Ready for the next trip',
      place: 'main',
   },
   {
      label: 'Settings',
      href: '/settings',
      Icon: Settings,
      subtitle: 'Make Hearth feel like home',
      place: 'household',
   },
]
export type { NavigationItem }

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
