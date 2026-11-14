import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

type PageHeaderProps = {
   title: string
   description?: string
   Icon?: LucideIcon
   action?: React.ReactNode
}

const PageHeader = ({ title, description, Icon, action }: PageHeaderProps) => {
   return (
      <motion.header
         initial={{ opacity: 0, y: 6 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.25, ease: 'easeOut' }}
         className='mb-8 flex flex-wrap items-end justify-between gap-4'
      >
         <div className='flex min-w-0 items-center gap-4'>
            {Icon && (
               <span className='grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15'>
                  <Icon className='size-6' />
               </span>
            )}
            <div className='min-w-0'>
               <h1 className='text-2xl font-semibold sm:text-3xl'>{title}</h1>
               {description && (
                  <p className='mt-1 text-sm text-muted-foreground'>
                     {description}
                  </p>
               )}
            </div>
         </div>
         {action}
      </motion.header>
   )
}

export default PageHeader
