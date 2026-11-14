import { useOutletContext } from 'react-router-dom'
import type { NavigationItem } from '@/types/types'

/** Title, subtitle and icon for a route, taken from the app's navigation config. */
export function usePageMeta(href: string) {
   const { navigationItems } = useOutletContext<{
      navigationItems: NavigationItem[]
   }>()
   return navigationItems.find((item) => item.href === href)
}
