import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, MailOpen } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { ROLE_LABEL } from '@/features/households/permissions'
import {
   readPendingInvite,
   useAcceptInvitation,
   useDeclineInvitation,
   useMyInvitations,
   type ReceivedInvitation,
} from './invitationsApi'

function Row({ inv }: { inv: ReceivedInvitation }) {
   const navigate = useNavigate()
   const accept = useAcceptInvitation()
   const decline = useDeclineInvitation()
   const busy = accept.isPending || decline.isPending
   return (
      <li className='flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4'>
         <span className='grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary'>
            <MailOpen className='size-5' />
         </span>
         {/* min width so the buttons wrap below on narrow screens instead of squeezing the text */}
         <span className='min-w-48 flex-1'>
            <span className='block text-sm'>
               <span className='font-medium'>{inv.inviter}</span> invited you to{' '}
               <span className='font-medium'>{inv.household}</span>
            </span>
            <span className='block text-xs text-muted-foreground'>
               As {ROLE_LABEL[inv.role].toLowerCase()}
               {inv.claims && `, taking over the profile ${inv.claims}`}
            </span>
         </span>
         <span className='ml-auto flex gap-2'>
            <Button
               variant='ghost'
               disabled={busy}
               onClick={() => decline.mutate(inv.id, { onError: (e) => toast.error(apiError(e).message) })}
            >
               Decline
            </Button>
            <Button
               disabled={busy}
               onClick={() =>
                  accept.mutate(
                     { id: inv.id },
                     {
                        onSuccess: (h) => {
                           toast.success(`Welcome to ${h.name}!`)
                           navigate('/members')
                        },
                        onError: (e) => toast.error(apiError(e).message),
                     },
                  )
               }
            >
               {accept.isPending ? 'Joining…' : 'Accept'}
            </Button>
         </span>
      </li>
   )
}

/** Invitations addressed to the signed-in user, plus a share link opened before signing in. */
const ReceivedInvitations = ({ heading = true }: { heading?: boolean }) => {
   const mine = useMyInvitations()
   const pendingLink = readPendingInvite()
   const list = mine.data ?? []
   if (list.length === 0 && !pendingLink) return null

   return (
      <section aria-labelledby={heading ? 'received-heading' : undefined} className='space-y-3'>
         {heading && (
            <h2 id='received-heading' className='text-sm font-medium text-muted-foreground'>
               Invitations for you
            </h2>
         )}
         <ul className='space-y-3'>
            {list.map((inv) => (
               <Row key={inv.id} inv={inv} />
            ))}
            {pendingLink && (
               <li className='flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4'>
                  <span className='min-w-0 flex-1 text-sm'>You opened an invite link before signing in.</span>
                  <Link to='/invite' className={buttonVariants()}>
                     Continue
                     <ArrowRight />
                  </Link>
               </li>
            )}
         </ul>
      </section>
   )
}

export default ReceivedInvitations
