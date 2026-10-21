import { Outlet } from 'react-router'
import Header from './Header'
import MainWrapper from './MainWrapper'
import {
   Calendar,
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
      subtitle: 'Schnuffis, together',
   },
   {
      label: 'Calendar',
      href: '/calendar',
      Icon: Calendar,
      subtitle: 'Schnuffis, together',
   },
   {
      label: 'Chores',
      href: '/chores',
      Icon: ClipboardCheck,
      subtitle: 'Schnuffis, together',
   },
   {
      label: 'Members',
      href: '/members',
      Icon: UserGroup,
      subtitle: 'Schnuffis, together',
   },
   {
      label: 'Shopping List',
      href: '/shopping-list',
      Icon: ShoppingCartPlus,
      subtitle: 'Schnuffis, together',
   },
   {
      label: 'Settings',
      href: '/settings',
      Icon: Settings,
      subtitle: 'Schnuffis, together',
   },
]
export type NavigationItem = (typeof navigationItems)[0]

const AppLayout = () => {
   return (
      <div>
         <Header navigationItems={navigationItems} />
         <MainWrapper>
            <Outlet context={{navigationItems}} />
         </MainWrapper>
      </div>
   )
}

export default AppLayout
