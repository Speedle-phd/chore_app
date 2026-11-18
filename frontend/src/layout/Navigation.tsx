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
import { useNavBadges, type NavBadge } from './useNavBadges'

type NavigationProps = {
   navigationItems: NavigationItem[]
}

const highlightTransition = {
   type: 'spring',
   stiffness: 380,
   damping: 32,
} as const

/**
 * Count or dot next to a nav item (high-contrast in every theme). Screen readers get the
 * words inside the link, so its name still starts with the visible label (WCAG 2.5.3).
 */
const Badge = ({ badge, className }: { badge: NavBadge; className?: string }) =>
   badge.count || badge.dot ? (
      <>
         {badge.count > 0 ? (
            <span
               aria-hidden
               className={cn(
                  'grid h-4.5 min-w-4.5 place-items-center rounded-full bg-foreground px-1 text-[0.6875rem] leading-none font-semibold text-background',
                  className,
               )}
            >
               {badge.count > 99 ? '99+' : badge.count}
            </span>
         ) : (
            <span aria-hidden className={cn('size-2.5 rounded-full bg-foreground', className)} />
         )}
         <span className='sr-only'>{badge.sr}</span>
      </>
   ) : null

const Navigation = ({ navigationItems }: NavigationProps) => {
   const [open, setOpen] = useState(false)
   const badgeFor = useNavBadges()
   // Something new anywhere: the phone menu button says so.
   const all = navigationItems.map((item) => badgeFor(item.href)).filter((b) => b.count || b.dot)
   const total = all.reduce((n, b) => n + b.count, 0)

   return (
      <>
         {/* Desktop: pill navigation */}
         <nav
            aria-label='Main'
            className='mx-auto hidden items-center gap-1 rounded-full border border-border/70 bg-muted/60 p-1 lg:flex'
         >
            {/* Members and Settings live in the household menu; the logo is the way home. */}
            {navigationItems.filter((item) => item.place === 'main').map(({ href, Icon, label }) => (
               <NavLink
                  key={href}
                  to={href}
                  end={href === '/'}
                  className='rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
               >
                  {({ isActive }) => (
                     <span
                        className={cn(
                           'relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
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
                        <span className='relative z-10'>{label}</span>
                        <Badge badge={badgeFor(href)} className='relative z-20' />
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
                        aria-label={all.length ? `Open navigation: ${all.map((b) => b.sr).join(', ')}` : 'Open navigation'}
                        className='relative'
                     >
                        <Menu />
                        {all.length > 0 && <Badge badge={{ count: total, dot: total === 0, sr: '' }} className='absolute -top-1.5 -right-1.5' />}
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
                                    <span aria-hidden className='block truncate text-xs text-muted-foreground'>
                                       {subtitle}
                                    </span>
                                 </span>
                                 <Badge badge={badgeFor(href)} className='ms-auto' />
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
