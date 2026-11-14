import { AtSign, Link2, Mail, RotateCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { ROLE_LABEL } from '@/features/households/permissions'
import { useHouseholdInvitations, useResendInvitation, useRevokeInvitation, type Invitation } from './invitationsApi'

const ICON = { email: Mail, user: AtSign, link: Link2 } as const

function describe(inv: Invitation) {
   if (inv.kind === 'email') return inv.email ?? 'Email invitation'
   if (inv.kind === 'user') return inv.user ? `${inv.user.fullName} (@${inv.user.handle})` : 'Invited user'
   return `Share link · used ${inv.uses} of ${inv.maxUses}`
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Pending invitations of a household, for owners and admins. Renders nothing when empty. */
const PendingInvitations = ({ householdId }: { householdId: string }) => {
   const invitations = useHouseholdInvitations(householdId, true)
   const revoke = useRevokeInvitation(householdId)
   const resend = useResendInvitation(householdId)
   const list = invitations.data ?? []
   if (list.length === 0) return null

   return (
      <section aria-labelledby='pending-heading' className='mt-10'>
         <h2 id='pending-heading' className='mb-3 text-sm font-medium text-muted-foreground'>
            Pending invitations
         </h2>
         <ul className='divide-y rounded-2xl border bg-card'>
            {list.map((inv) => {
               const Icon = ICON[inv.kind]
               return (
                  <li key={inv.id} className='flex flex-wrap items-center gap-3 px-4 py-3'>
                     <span className='grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground'>
                        <Icon className='size-4' />
                     </span>
                     <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-medium'>{describe(inv)}</span>
                        <span className='block text-xs text-muted-foreground'>
                           {ROLE_LABEL[inv.role]}
                           {inv.claims && ` · takes over ${inv.claims.fullName}`} · expires {fmtDate(inv.expiresAt)}
                        </span>
                     </span>
                     <span className='flex gap-1'>
                        {inv.kind === 'email' && (
                           <Button
                              size='sm'
                              variant='ghost'
                              disabled={resend.isPending}
                              onClick={() =>
                                 resend.mutate(inv.id, {
                                    onSuccess: (r) =>
                                       r.emailSent ? toast.success('Invitation sent again') : toast.error('The email couldn’t be sent.'),
                                    onError: (e) => toast.error(apiError(e).message),
                                 })
                              }
                           >
                              <RotateCw />
                              Resend
                           </Button>
                        )}
                        <Button
                           size='sm'
                           variant='ghost'
                           className='text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                           disabled={revoke.isPending}
                           aria-label={`Revoke invitation: ${describe(inv)}`}
                           onClick={() =>
                              revoke.mutate(inv.id, {
                                 onSuccess: () => toast.success('Invitation revoked'),
                                 onError: (e) => toast.error(apiError(e).message),
                              })
                           }
                        >
                           <X />
                           Revoke
                        </Button>
                     </span>
                  </li>
               )
            })}
         </ul>
      </section>
   )
}

export default PendingInvitations
