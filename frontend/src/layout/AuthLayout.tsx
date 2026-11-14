import { Link } from 'react-router-dom'
import { Flame } from 'lucide-react'
import { motion } from 'motion/react'
import { ModeToggle } from '@/components/mode-toggle'

type AuthLayoutProps = {
   title: string
   description?: React.ReactNode
   children: React.ReactNode
   footer?: React.ReactNode
   /** Extra controls in the top bar, e.g. sign out. */
   headerActions?: React.ReactNode
}

/** Centered card for the signed-out pages (login, signup, reset, …). */
const AuthLayout = ({ title, description, children, footer, headerActions }: AuthLayoutProps) => {
   return (
      <div className='relative flex min-h-dvh flex-col overflow-hidden'>
         <div
            aria-hidden
            className='pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl'
         />
         <header className='relative flex items-center justify-between px-4 py-4 sm:px-6'>
            <Link
               to='/'
               className='flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
            >
               <span className='grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30'>
                  <Flame className='size-5' />
               </span>
               <span className='text-lg font-semibold tracking-tight'>Hearth</span>
            </Link>
            <div className='flex items-center gap-2'>
               {headerActions}
               <ModeToggle />
            </div>
         </header>

         <main className='relative flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0'>
            <motion.div
               initial={{ opacity: 0, y: 8 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.25, ease: 'easeOut' }}
               className='w-full max-w-sm'
            >
               <div className='rounded-2xl border bg-card p-6 shadow-sm sm:p-8'>
                  <h1 className='text-2xl font-semibold'>{title}</h1>
                  {description && (
                     <p className='mt-1.5 text-sm text-muted-foreground'>{description}</p>
                  )}
                  <div className='mt-6'>{children}</div>
               </div>
               {footer && (
                  <div className='mt-6 text-center text-sm text-muted-foreground'>{footer}</div>
               )}
            </motion.div>
         </main>
      </div>
   )
}

export default AuthLayout
