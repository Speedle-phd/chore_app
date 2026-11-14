import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { NavigationItem } from '@/types/types'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { NavLink } from 'react-router-dom'
import {
   Sheet,
   SheetContent,
   SheetDescription,
   SheetHeader,
   SheetTitle,
   SheetTrigger,
} from '@/components/ui/sheet'
import { Menu } from 'lucide-react'

type NavigationProps = {
   navigationItems: NavigationItem[]
}

const highlightTransition = {
   type: 'spring',
   stiffness: 380,
   damping: 32,
} as const

const Navigation = ({ navigationItems }: NavigationProps) => {
   const [open, setOpen] = useState(false)

   return (
      <>
         {/* Desktop: pill navigation */}
         <nav
            aria-label='Main'
            className='mx-auto hidden items-center gap-1 rounded-full border border-border/70 bg-muted/60 p-1 lg:flex'
         >
            {navigationItems.map(({ href, Icon, label }) => (
               <NavLink
                  key={href}
                  to={href}
                  end={href === '/'}
                  title={label}
                  aria-label={label}
                  className='rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
               >
                  {({ isActive }) => (
                     <span
                        className={cn(
                           'relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors xl:px-3.5',
                           isActive
                              ? 'text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                        )}
                     >
                        {isActive && (
                           <motion.span
                              layoutId='nav-highlight'
                              className='absolute inset-0 rounded-full bg-card shadow-sm ring-1 ring-border/70'
                              transition={highlightTransition}
                           />
                        )}
                        <Icon
                           className={cn(
                              'relative z-10 size-4',
                              isActive && 'text-primary',
                           )}
                        />
                        {/* Icons only between lg and xl, so the header never wraps */}
                        <span className='relative z-10 hidden xl:inline'>{label}</span>
                     </span>
                  )}
               </NavLink>
            ))}
         </nav>

         {/* Mobile: slide-over sheet */}
         <div className='order-last lg:hidden'>
            <Sheet open={open} onOpenChange={setOpen}>
               <SheetTrigger
                  render={
                     <Button
                        variant='outline'
                        size='icon'
                        aria-label='Open navigation'
                     >
                        <Menu />
                     </Button>
                  }
               />
               <SheetContent className='gap-0 p-0'>
                  <SheetHeader className='border-b p-5'>
                     <SheetTitle className='text-base'>Navigate</SheetTitle>
                     <SheetDescription>
                        Jump to any part of your home.
                     </SheetDescription>
                  </SheetHeader>
                  <nav aria-label='Main' className='flex flex-col gap-1 p-3'>
                     {navigationItems.map(({ href, Icon, label, subtitle }) => (
                        <NavLink
                           key={href}
                           to={href}
                           end={href === '/'}
                           onClick={() => setOpen(false)}
                           className='rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
                        >
                           {({ isActive }) => (
                              <span
                                 className={cn(
                                    'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                                    isActive
                                       ? 'bg-primary/10 text-foreground'
                                       : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                 )}
                              >
                                 <span
                                    className={cn(
                                       'grid size-9 shrink-0 place-items-center rounded-lg',
                                       isActive
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-muted',
                                    )}
                                 >
                                    <Icon className='size-4' />
                                 </span>
                                 <span className='min-w-0'>
                                    <span className='block text-sm font-medium'>
                                       {label}
                                    </span>
                                    <span className='block truncate text-xs text-muted-foreground'>
                                       {subtitle}
                                    </span>
                                 </span>
                              </span>
                           )}
                        </NavLink>
                     ))}
                  </nav>
               </SheetContent>
            </Sheet>
         </div>
      </>
   )
}

export default Navigation
