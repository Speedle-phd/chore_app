import { useResize } from '@/hooks/useResize'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { NavigationItem } from '@/types/types'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

import { NavLink } from 'react-router-dom'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'



type NavigationProps = {
   navigationItems: NavigationItem[]
   SMALL_SCREEN_WIDTH: number
}

const Navigation = ({ navigationItems, SMALL_SCREEN_WIDTH }: NavigationProps) => {
   const { width } = useResize()
   const [open, setOpen] = useState(false)
   return (
      <>
         {width < SMALL_SCREEN_WIDTH ? (
            <div className="flex justify-center py-2">
               <Sheet open={open} onOpenChange={setOpen}>
                  <SheetTrigger render={<Button variant="outline" className={cn('cursor-pointer w-8 aspect-square', 'bg-theme')} onClick={() => setOpen(true)}>
                     <Menu />
                  </Button>} />
                  <SheetContent>
                     <SheetHeader className={"mt-10"}>
                        <SheetTitle>Navigation</SheetTitle>
                        <SheetDescription className="">
                           Use the navigation menu to switch between different sections of the app.
                        </SheetDescription>
                     </SheetHeader>
                     {navigationItems.map((item) => {
                        const { href, Icon, label } = item
                        return (
                           <NavLink key={href} to={href} className='relative' onClick={() => setOpen(false)}>
                              {({ isActive }) => (
                                 <div
                                    className={cn(
                                       'relative flex items-center gap-2',
                                       'rounded-[5px_5px_0_0] py-2 px-4',
                                       'text-xs transition-colors duration-200',
                                       isActive
                                          ? 'text-primary-foreground'
                                          : 'text-muted-foreground hover:text-foreground',
                                    )}
                                 >
                                    {isActive && (
                                       <motion.div
                                          layoutId='nav-highlight'
                                          className={cn(
                                             'absolute inset-0 rounded-[5px_5px_0_0]',
                                             'bg-theme',
                                          )}
                                          transition={{
                                             type: 'spring',
                                             stiffness: 380,
                                             damping: 32,
                                          }}
                                       />
                                    )}

                                    <Icon size={16} className='relative z-10 text-primary-foreground' />

                                    <span className='relative z-10'>
                                       {label}
                                    </span>
                                 </div>
                              )}
                           </NavLink>
                        )
                     })}
                  </SheetContent>
               </Sheet>
            </div>
         ) : (
            <div className={cn('flex justify-center gap-4')}>
               {navigationItems.map((item) => {
                  const { href, Icon, label } = item
                  return (
                     <NavLink key={href} to={href} className='relative'>
                        {({ isActive }) => (
                           <div
                              className={cn(
                                 'relative flex items-center justify-center gap-2',
                                 'rounded-[5px_5px_0_0] py-2 px-4',
                                 'text-xs transition-colors duration-200',
                                 isActive
                                    ? 'text-secondary'
                                    : 'text-muted-foreground hover:text-foreground',
                              )}
                           >
                              {isActive && (
                                 <motion.div
                                    layoutId='nav-highlight'
                                    className={cn(
                                       'absolute inset-0 rounded-[5px_5px_0_0]',
                                       'bg-theme',
                                    )}
                                    transition={{
                                       type: 'spring',
                                       stiffness: 380,
                                       damping: 32,
                                    }}
                                 />
                              )}

                              <Icon size={16} className='relative z-10' />

                              <span className='relative z-10 text-center'>
                                 {label}
                              </span>
                           </div>
                        )}
                     </NavLink>
                  )
               })}
            </div>
         )}
      </>
   )
}

export default Navigation
