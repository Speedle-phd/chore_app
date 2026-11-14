import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

const NotFound = () => {
   return (
      <main className='flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center'>
         <span className='mb-4 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary'>
            <Compass className='size-7' />
         </span>
         <p className='text-sm font-medium text-primary'>404</p>
         <h1 className='text-3xl font-semibold'>Page not found</h1>
         <p className='max-w-sm text-muted-foreground'>
            The page you are looking for doesn't exist or has moved.
         </p>
         <Link to='/' className={buttonVariants({ size: 'lg', className: 'mt-6 px-4' })}>
            Back home
         </Link>
      </main>
   )
}

export default NotFound
