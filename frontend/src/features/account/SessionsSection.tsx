import { LogOut, Monitor, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { describeDevice, isMobile } from '@/lib/userAgent'
import { useRevokeOtherSessions, useRevokeSession, useSessions } from './accountApi'

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function lastActive(iso: string) {
   const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000)
   if (minutes > -5) return 'Active now'
   if (minutes > -60) return `Active ${relative.format(minutes, 'minute')}`
   const hours = Math.round(minutes / 60)
   if (hours > -24) return `Active ${relative.format(hours, 'hour')}`
   return `Active ${relative.format(Math.round(hours / 24), 'day')}`
}

/** Devices signed in to this account, with sign-out per device and for all others. */
const SessionsSection = () => {
   const sessions = useSessions()
   const revoke = useRevokeSession()
   const revokeOthers = useRevokeOtherSessions()
   // This device first, then the most recently active.
   const list = [...(sessions.data ?? [])].sort((a, b) => Number(b.current) - Number(a.current))
   const others = list.filter((s) => !s.current).length

   if (sessions.isPending) return <div className='h-32 animate-pulse rounded-xl bg-muted' aria-busy='true' aria-label='Loading devices' />
   if (sessions.isError) {
      return (
         <p className='text-sm text-muted-foreground'>
            {apiError(sessions.error).message}{' '}
            <Button variant='link' className='h-auto p-0' onClick={() => void sessions.refetch()}>
               Try again
            </Button>
         </p>
      )
   }

   return (
      <div className='space-y-4'>
         <ul className='divide-y rounded-xl border'>
            {list.map((s) => {
               const Icon = isMobile(s.userAgent) ? Smartphone : Monitor
               return (
                  <li key={s.id} className='flex items-center gap-3 px-3 py-3'>
                     <Icon className='size-5 shrink-0 text-muted-foreground' />
                     <span className='min-w-0 flex-1'>
                        <span className='flex items-center gap-2 text-sm font-medium'>
                           <span className='truncate'>{describeDevice(s.userAgent)}</span>
                           {s.current && (
                              <span className='shrink-0 rounded-full bg-primary/15 px-1.5 text-[0.65rem] font-medium text-primary'>
                                 This device
                              </span>
                           )}
                        </span>
                        <span className='block text-xs text-muted-foreground'>
                           {s.current ? 'Active now' : lastActive(s.lastSeenAt)} · signed in{' '}
                           {new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                     </span>
                     {!s.current && (
                        <Button
                           size='sm'
                           variant='ghost'
                           className='text-muted-foreground hover:text-destructive'
                           aria-label={`Sign out ${describeDevice(s.userAgent)}`}
                           disabled={revoke.isPending}
                           onClick={() =>
                              revoke.mutate(s.id, {
                                 onSuccess: () => toast.success('Device signed out'),
                                 onError: (e) => toast.error(apiError(e).message),
                              })
                           }
                        >
                           Sign out
                        </Button>
                     )}
                  </li>
               )
            })}
         </ul>
         <Button
            variant='outline'
            disabled={others === 0 || revokeOthers.isPending}
            onClick={() =>
               revokeOthers.mutate(undefined, {
                  onSuccess: (r) => toast.success(`Signed out ${r.signedOut} other ${r.signedOut === 1 ? 'device' : 'devices'}`),
                  onError: (e) => toast.error(apiError(e).message),
               })
            }
         >
            <LogOut />
            Sign out all other devices
         </Button>
         {others === 0 && <p className='text-xs text-muted-foreground'>You’re only signed in on this device.</p>}
      </div>
   )
}

export default SessionsSection
