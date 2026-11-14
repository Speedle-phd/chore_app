import { Loader2, WifiOff } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { RealtimeConnection } from '@/features/realtime/Realtime'
import { safeNextPath, useMe } from './authApi'

function FullScreen({ children }: { children: React.ReactNode }) {
   return (
      <div className='grid min-h-dvh place-items-center p-6 text-center'>
         <div className='flex flex-col items-center gap-3'>{children}</div>
      </div>
   )
}

function Checking() {
   return (
      <FullScreen>
         <Loader2 className='size-6 animate-spin text-primary' />
         <span className='sr-only' role='status'>
            Loading…
         </span>
      </FullScreen>
   )
}

function useMeOrScreen() {
   const me = useMe()
   if (me.isPending) return { screen: <Checking /> }
   if (me.isError) {
      return {
         screen: (
            <FullScreen>
               <WifiOff className='size-6 text-muted-foreground' />
               <p className='text-sm text-muted-foreground'>{apiError(me.error).message}</p>
               <Button variant='outline' onClick={() => void me.refetch()}>
                  Try again
               </Button>
            </FullScreen>
         ),
      }
   }
   return { user: me.data }
}

/** Renders the app only for signed-in users; others go to /login?next=… */
export function RequireAuth() {
   const location = useLocation()
   const { screen, user } = useMeOrScreen()
   if (screen) return screen
   if (!user) {
      const next = location.pathname + location.search
      return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
   }
   return (
      <>
         {/* Live updates while signed in (also on onboarding, for incoming invitations). */}
         <RealtimeConnection />
         <Outlet />
      </>
   )
}

/**
 * Login/signup/forgot: signed-in users go straight to the app, to `?next=` if
 * given. Handling it here means every way of signing in (password, passkey
 * button, passkey autofill) ends up in the same place.
 */
export function GuestOnly() {
   const { screen, user } = useMeOrScreen()
   const location = useLocation()
   if (screen) return screen
   if (user) return <Navigate to={safeNextPath(new URLSearchParams(location.search).get('next'))} replace />
   return <Outlet />
}
