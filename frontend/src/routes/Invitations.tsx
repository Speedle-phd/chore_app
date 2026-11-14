import { Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { readPendingInvite, useMyInvitations } from '@/features/invitations/invitationsApi'
import ReceivedInvitations from '@/features/invitations/ReceivedInvitations'

/** Invitations addressed to me (linked from invitation emails sent via @handle). */
const Invitations = () => {
   const mine = useMyInvitations()
   const empty = mine.isSuccess && mine.data.length === 0 && !readPendingInvite()
   return (
      <>
         <PageHeader title='Invitations' description='Households that invited you.' Icon={Inbox} />
         {empty ? (
            <EmptyState Icon={Inbox} title='No open invitations' description='When someone invites you, it shows up here.'>
               <Link to='/' className={buttonVariants({ variant: 'outline' })}>
                  Back home
               </Link>
            </EmptyState>
         ) : (
            <ReceivedInvitations heading={false} />
         )}
      </>
   )
}

export default Invitations
