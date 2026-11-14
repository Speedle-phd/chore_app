import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, MailOpen } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { useMe } from '@/features/auth/authApi'
import FormAlert from '@/features/auth/FormAlert'
import { useUrlToken } from '@/features/auth/useUrlToken'
import { ROLE_LABEL } from '@/features/households/permissions'
import {
   clearPendingInvite,
   readPendingInvite,
   savePendingInvite,
   useAcceptInvitation,
   useInvitationPreview,
} from '@/features/invitations/invitationsApi'
import AuthLayout from '@/layout/AuthLayout'

/** Landing page of an emailed or shared invitation link. */
const Invite = () => {
   const urlToken = useUrlToken()
   const token = urlToken ?? readPendingInvite()
   const navigate = useNavigate()
   const me = useMe()
   const preview = useInvitationPreview(token)
   const accept = useAcceptInvitation()
   const signedIn = Boolean(me.data)

   // Keep a share link while the visitor signs in or creates an account. Email
   // invitations don't need this: they show up in-app for the invited address.
   const kind = preview.data?.kind
   useEffect(() => {
      if (urlToken && me.data === null && kind === 'link') savePendingInvite(urlToken)
   }, [urlToken, me.data, kind])
   useEffect(() => {
      if (preview.isError) clearPendingInvite()
   }, [preview.isError])

   if (!token) {
      return (
         <AuthLayout title='Invitation link incomplete' description='Ask the person who invited you to send the link again.'>
            <Link to='/' className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
               Go to Hearth
            </Link>
         </AuthLayout>
      )
   }

   if (preview.isPending || me.isPending) {
      return (
         <AuthLayout title='Opening invitation'>
            <div role='status' className='flex items-center gap-3 text-sm text-muted-foreground'>
               <Loader2 className='size-5 animate-spin text-primary' />
               One moment…
            </div>
         </AuthLayout>
      )
   }

   if (preview.isError) {
      return (
         <AuthLayout title='Invitation not valid' description={apiError(preview.error).message}>
            <Link to='/' className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
               Go to Hearth
            </Link>
         </AuthLayout>
      )
   }

   const inv = preview.data
   const error = accept.isError ? apiError(accept.error) : null

   return (
      <AuthLayout
         title={`Join ${inv.household}`}
         description={
            <>
               <span className='font-medium text-foreground'>{inv.inviter}</span> invited you to their household on Hearth.
            </>
         }
      >
         <div className='space-y-5'>
            <div className='flex gap-3 rounded-xl border bg-muted/40 p-3 text-sm'>
               <MailOpen className='mt-0.5 size-4 shrink-0 text-primary' />
               <div className='space-y-1'>
                  <p>
                     You’ll join as <span className='font-medium'>{ROLE_LABEL[inv.role].toLowerCase()}</span>
                     {inv.claims && (
                        <>
                           , taking over the profile <span className='font-medium'>{inv.claims}</span>
                        </>
                     )}
                     .
                  </p>
                  {inv.emailHint && (
                     <p className='text-muted-foreground'>This invitation is for {inv.emailHint}.</p>
                  )}
               </div>
            </div>

            {error && <FormAlert tone='error' error={error} />}

            {signedIn ? (
               <div className='flex flex-col gap-2'>
                  <Button
                     size='lg'
                     className='h-10'
                     disabled={accept.isPending}
                     onClick={() =>
                        accept.mutate(
                           { token },
                           {
                              onSuccess: (h) => {
                                 toast.success(`Welcome to ${h.name}!`)
                                 navigate('/members', { replace: true })
                              },
                           },
                        )
                     }
                  >
                     {accept.isPending ? 'Joining…' : `Join ${inv.household}`}
                  </Button>
                  <Button
                     variant='ghost'
                     onClick={() => {
                        clearPendingInvite()
                        navigate('/', { replace: true })
                     }}
                  >
                     Not now
                  </Button>
               </div>
            ) : (
               <div className='flex flex-col gap-2'>
                  <Link to='/signup' className={buttonVariants({ size: 'lg', className: 'h-10' })}>
                     Create an account
                  </Link>
                  <Link to='/login?next=%2Finvite' className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-10' })}>
                     I already have an account
                  </Link>
                  <p className='pt-1 text-center text-xs text-muted-foreground'>
                     {inv.emailHint
                        ? `Use ${inv.emailHint}. You’ll find the invitation after signing in.`
                        : 'After signing in you can accept the invitation.'}
                  </p>
               </div>
            )}
         </div>
      </AuthLayout>
   )
}

export default Invite
