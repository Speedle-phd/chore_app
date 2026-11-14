import { useState } from 'react'
import { Search, SearchX, UserPlus, WifiOff } from 'lucide-react'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import MemberCard, { AddProfileCard } from '@/components/MemberCard'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useHousehold, useMembers, type Member } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'
import InviteDialog from '@/features/invitations/InviteDialog'
import PendingInvitations from '@/features/invitations/PendingInvitations'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageMeta } from './usePageMeta'

const ROLE_ORDER = { owner: 0, admin: 1, member: 2 } as const
const byRoleThenName = (a: Member, b: Member) =>
   ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.fullName.localeCompare(b.fullName)

const Members = () => {
   const meta = usePageMeta('/members')
   const household = useHousehold()
   const members = useMembers(household.id)
   const [filter, setFilter] = useState('')
   const term = useDebounce(filter, 300).trim().toLowerCase()

   const all = [...(members.data ?? [])].sort(byRoleThenName)
   const visible = all.filter((m) =>
      [m.fullName, m.email].some((value) => (value ?? '').toLowerCase().includes(term)),
   )
   const mayManage = canManage(household.role)

   return (
      <>
         <PageHeader
            title={meta?.label ?? 'Members'}
            description={`The people of ${household.name}`}
            Icon={meta?.Icon}
            action={
               <div className='flex items-center gap-3'>
                  {members.data && (
                     <Badge variant='secondary' className='h-7 px-3 text-sm'>
                        {all.length} {all.length === 1 ? 'person' : 'people'}
                     </Badge>
                  )}
                  {mayManage && (
                     <InviteDialog
                        householdId={household.id}
                        householdName={household.name}
                        myRole={household.role}
                        profiles={all.filter((m) => m.kind === 'profile')}
                        trigger={
                           <Button>
                              <UserPlus />
                              Invite
                           </Button>
                        }
                     />
                  )}
               </div>
            }
         />

         <div className='relative mb-6 max-w-sm'>
            <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
               type='search'
               className='h-10 rounded-xl bg-card pl-9'
               value={filter}
               onChange={(e) => setFilter(e.target.value)}
               placeholder='Search by name or email'
               aria-label='Search members'
            />
         </div>

         {members.isPending ? (
            <div className='auto-grid' aria-busy='true' aria-label='Loading members'>
               {[0, 1, 2].map((i) => (
                  <div key={i} className='h-44 animate-pulse rounded-2xl bg-muted' />
               ))}
            </div>
         ) : members.isError ? (
            <EmptyState Icon={WifiOff} title='Couldn’t load members' description={apiError(members.error).message}>
               <Button variant='outline' onClick={() => void members.refetch()}>
                  Try again
               </Button>
            </EmptyState>
         ) : term && visible.length === 0 ? (
            <EmptyState
               Icon={SearchX}
               title='No matches'
               description={`Nobody matches “${term}”. Try a different name or email.`}
            />
         ) : (
            <div className='auto-grid'>
               {visible.map((member) => (
                  <MemberCard key={member.id} member={member} myRole={household.role} householdId={household.id} />
               ))}
               {!term && mayManage && <AddProfileCard householdId={household.id} />}
            </div>
         )}
         {mayManage && <PendingInvitations householdId={household.id} />}
      </>
   )
}

export default Members
