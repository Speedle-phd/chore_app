import { ModeToggle } from '@/components/mode-toggle'
import { useLocation } from 'react-router-dom'

import { useResize } from '@/hooks/useResize'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'motion/react'
import Navigation from './Navigation'
import type { NavigationItem } from './AppLayout'

type HeaderProps = {
   navigationItems: NavigationItem[]
}
const Header = ({ navigationItems }: HeaderProps) => {
   const { width } = useResize()

   const location = useLocation()

   const SMALL_SCREEN_WIDTH = 800
   const path = location && location.pathname
   const pathElement = navigationItems.find((item) => item.href === path)

   return (
      <div
         className={cn(
            'bg-primary-foreground pt-4 flex flex-col px-10 shadow-theme shadow-sm',
            width < SMALL_SCREEN_WIDTH && 'pb-4',
         )}
      >
         <header className='flex justify-between gap-1'>
            <div className={cn('my-2 flex gap-4 text-lg font-bold', width >= SMALL_SCREEN_WIDTH && 'mb-4')}>
               <div
                  className={cn(
                     'bg-theme text-primary-foreground',
                     'grid items-center rounded-md p-2',
                  )}
                  style={{ perspective: 400 }}
               >
                  <AnimatePresence mode='wait' initial={false}>
                     {pathElement?.Icon && (
                        <motion.div
                           key={location.pathname}
                           initial={{ rotateY: -90, opacity: 0 }}
                           animate={{ rotateY: 0, opacity: 1 }}
                           exit={{ rotateY: 90, opacity: 0 }}
                           transition={{
                              duration: 0.25,
                              ease: 'easeInOut',
                           }}
                        >
                           <pathElement.Icon />
                        </motion.div>
                     )}
                  </AnimatePresence>
               </div>

               <div className='flex h-full flex-col justify-center'>
                  <h1>{pathElement?.label}</h1>
                  <div className='text-[0.6rem] text-muted-foreground'>
                     {pathElement?.subtitle}
                  </div>
               </div>
            </div>

            <div className='ml-auto flex items-center gap-6'>
               <ModeToggle />
               {width <= SMALL_SCREEN_WIDTH && (
                  <Navigation
                     navigationItems={navigationItems}
                     SMALL_SCREEN_WIDTH={SMALL_SCREEN_WIDTH}
                  />
               )}
            </div>
         </header>

         {width > SMALL_SCREEN_WIDTH && (
            <Navigation
               navigationItems={navigationItems}
               SMALL_SCREEN_WIDTH={SMALL_SCREEN_WIDTH}
            />
         )}
      </div>
   )
}

export default Header
