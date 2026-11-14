import type { LucideIcon } from 'lucide-react'

type EmptyStateProps = {
   Icon: LucideIcon
   title: string
   description: string
   children?: React.ReactNode
}

const EmptyState = ({ Icon, title, description, children }: EmptyStateProps) => {
   return (
      <div className='flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center'>
         <span className='mb-4 grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground'>
            <Icon className='size-6' />
         </span>
         <h2 className='text-base font-semibold'>{title}</h2>
         <p className='mt-1 max-w-sm text-sm text-muted-foreground'>
            {description}
         </p>
         {children && <div className='mt-6'>{children}</div>}
      </div>
   )
}

export default EmptyState
