import { Navigate, useNavigate } from 'react-router-dom'
import { Home, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useLogout, useMe } from '@/features/auth/authApi'
import HouseholdNameForm from '@/features/households/HouseholdNameForm'
import { useCreateHousehold, useCurrentHousehold } from '@/features/households/householdsApi'
import HandleForm from '@/features/account/HandleForm'
import ReceivedInvitations from '@/features/invitations/ReceivedInvitations'
import AuthLayout from '@/layout/AuthLayout'

/** First stop for someone without a household: accept an invitation or create one. */
const Onboarding = () => {
   const { data: me } = useMe()
   const { household, query } = useCurrentHousehold()
   const create = useCreateHousehold()
   const logout = useLogout()
   const navigate = useNavigate()
   const signOut = () =>
      logout.mutate(undefined, {
         onSuccess: () => navigate('/login', { replace: true }),
         onError: (error) => toast.error(apiError(error).message),
      })

   // Getting a household here means you just created or joined one: show its people.
   if (!query.isPending && household) return <Navigate to='/members' replace />

   return (
      <AuthLayout
         title={`Welcome${me ? `, ${me.fname}` : ''}!`}
         description='Hearth is organised around a household: the people you share chores, plans and groceries with.'
         headerActions={
            <>
               {me && (
                  <span className='hidden max-w-48 truncate text-sm text-muted-foreground sm:inline' title={me.email}>
                     {me.email}
                  </span>
               )}
               <Button variant='outline' onClick={signOut} disabled={logout.isPending}>
                  <LogOut />
                  Sign out
               </Button>
            </>
         }
      >
         <div className='space-y-6'>
            <ReceivedInvitations />
            <div className='flex gap-3 rounded-xl border bg-muted/40 p-3 text-sm'>
               <Home className='mt-0.5 size-4 shrink-0 text-primary' />
               <p>
                  <span className='font-medium'>Start a household.</span>{' '}
                  <span className='text-muted-foreground'>
                     You’ll be its owner and can add the people you live with.
                  </span>
               </p>
            </div>
            <HouseholdNameForm
               submitLabel='Create household'
               pendingLabel='Creating…'
               isPending={create.isPending}
               error={create.isError ? apiError(create.error) : null}
               autoFocus
               onSubmit={(name) => create.mutate(name)}
            />
            <p className='text-sm text-muted-foreground'>
               Joining someone else’s household instead? You don’t need to create one: ask them to invite you
               {me ? ` (${me.email})` : ''}. You can{' '}
               <button
                  type='button'
                  onClick={signOut}
                  disabled={logout.isPending}
                  className='font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50'
               >
                  sign out
               </button>{' '}
               in the meantime; the invitation will be waiting here when you’re back.
            </p>
            <details className='group rounded-xl border p-3 text-sm'>
               <summary className='cursor-pointer font-medium marker:text-muted-foreground'>
                  Be findable by @handle
               </summary>
               <p className='mt-2 mb-4 text-muted-foreground'>
                  Pick a handle and allow others to find you, so they can invite you without your email.
               </p>
               <HandleForm />
            </details>
         </div>
      </AuthLayout>
   )
}

export default Onboarding
