import { Loader2, WifiOff } from 'lucide-react'
import { Navigate, Outlet } from 'react-router-dom'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useCurrentHousehold } from './householdsApi'

/** The app needs a household; people without one go to onboarding first. */
export function RequireHousehold() {
   const { household, query } = useCurrentHousehold()

   if (query.isPending) {
      return (
         <div className='grid min-h-dvh place-items-center'>
            <Loader2 className='size-6 animate-spin text-primary' />
            <span className='sr-only' role='status'>
               Loading…
            </span>
         </div>
      )
   }
   if (query.isError) {
      return (
         <div className='grid min-h-dvh place-items-center p-6 text-center'>
            <div className='flex flex-col items-center gap-3'>
               <WifiOff className='size-6 text-muted-foreground' />
               <p className='text-sm text-muted-foreground'>{apiError(query.error).message}</p>
               <Button variant='outline' onClick={() => void query.refetch()}>
                  Try again
               </Button>
            </div>
         </div>
      )
   }
   if (!household) return <Navigate to='/onboarding' replace />
   return <Outlet />
}
