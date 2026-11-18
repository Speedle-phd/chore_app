import { useState } from 'react'
import { LogOut, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import SettingsSection from '@/components/SettingsSection'
import HouseholdNameForm from '@/features/households/HouseholdNameForm'
import { RemindersSection } from '@/features/reminders/RemindersSection'
import { FeedSection } from '@/features/ical/FeedSection'
import { GuestSection } from '@/features/guest/GuestSection'
import { MotivationSection } from '@/features/stats/MotivationSection'
import { RegionSection } from '@/features/holidays/RegionSection'
import {
   useDeleteHousehold,
   useHousehold,
   useLeaveHousehold,
   useRenameHousehold,
} from '@/features/households/householdsApi'
import { canDeleteHousehold, canManage, ROLE_LABEL } from '@/features/households/permissions'
import { usePageMeta } from './usePageMeta'

const Settings = () => {
   const meta = usePageMeta('/settings')
   const navigate = useNavigate()
   const household = useHousehold()
   const rename = useRenameHousehold(household.id)
   const leave = useLeaveHousehold(household.id)
   const remove = useDeleteHousehold(household.id)
   const [leaveOpen, setLeaveOpen] = useState(false)
   const [deleteOpen, setDeleteOpen] = useState(false)

   return (
      <>
         <PageHeader title={meta?.label ?? 'Settings'} description={meta?.subtitle} Icon={meta?.Icon} />

         <p className='mb-6 text-sm text-muted-foreground'>
            Your name, picture, password and privacy are on your{' '}
            <Link to='/account' className='font-medium text-primary underline-offset-4 hover:underline'>
               Account
            </Link>{' '}
            page.
         </p>

         <div className='rounded-2xl border bg-card p-6 sm:p-8'>
            <SettingsSection
               title='Household'
               description={`You’re ${ROLE_LABEL[household.role].toLowerCase()} of ${household.name}.`}
            >
               {canManage(household.role) ? (
                  <HouseholdNameForm
                     key={household.id}
                     defaultName={household.name}
                     submitLabel='Save name'
                     pendingLabel='Saving…'
                     isPending={rename.isPending}
                     error={rename.isError ? apiError(rename.error) : null}
                     onSubmit={(name) => rename.mutate(name, { onSuccess: () => toast.success('Household renamed') })}
                  />
               ) : (
                  <p className='text-sm text-muted-foreground'>Only owners and admins can rename the household.</p>
               )}
            </SettingsSection>

            <SettingsSection
               title='Public holidays'
               description='Show the public holidays of your German state in the calendar.'
            >
               <RegionSection household={household} />
            </SettingsSection>

            <SettingsSection
               title='Motivation'
               description='Points and statistics are always there; these playful extras can be switched off for everyone.'
            >
               <MotivationSection household={household} />
            </SettingsSection>

            <SettingsSection
               title='Reminders'
               description='Get reminded of birthdays and events. Only you see your reminders.'
            >
               <RemindersSection householdId={household.id} />
            </SettingsSection>

            <SettingsSection
               title='Calendar app'
               description='See this household’s calendar in Google Calendar, Apple Calendar or Outlook through a private link. It’s read-only; they refresh it every few hours.'
            >
               <FeedSection householdId={household.id} />
            </SettingsSection>

            <SettingsSection
               title='Guest page'
               description='Wi-Fi, emergency numbers, contacts and routines for a babysitter or house sitter, shared through a private link that needs no account.'
            >
               <GuestSection household={household} />
            </SettingsSection>

            <SettingsSection title='Leave' description='Stop being part of this household. Someone can invite you again later.'>
               <ConfirmDeleteDialog
                  open={leaveOpen}
                  onOpenChange={setLeaveOpen}
                  trigger={
                     <Button variant='outline'>
                        <LogOut />
                        Leave {household.name}
                     </Button>
                  }
                  title={`Leave ${household.name}?`}
                  description='You’ll lose access to its chores and members.'
                  confirmLabel='Leave'
                  isPending={leave.isPending}
                  onConfirm={() =>
                     leave.mutate(undefined, {
                        onSuccess: () => {
                           setLeaveOpen(false)
                           navigate('/', { replace: true })
                        },
                        onError: (error) => toast.error(apiError(error).message),
                     })
                  }
               />
            </SettingsSection>

            {canDeleteHousehold(household.role) && (
               <SettingsSection
                  title='Delete household'
                  description='Removes the household, everyone’s access and all profiles. This can’t be undone.'
               >
                  <ConfirmDeleteDialog
                     open={deleteOpen}
                     onOpenChange={setDeleteOpen}
                     trigger={
                        <Button variant='destructive'>
                           <Trash2 />
                           Delete {household.name}
                        </Button>
                     }
                     title={`Delete ${household.name}?`}
                     description={`All ${household.memberCount} people lose access and all profiles are deleted. This can’t be undone.`}
                     confirmLabel='Delete household'
                     isPending={remove.isPending}
                     onConfirm={() =>
                        remove.mutate(undefined, {
                           onSuccess: () => {
                              setDeleteOpen(false)
                              toast.success('Household deleted')
                              navigate('/', { replace: true })
                           },
                           onError: (error) => toast.error(apiError(error).message),
                        })
                     }
                  />
               </SettingsSection>
            )}
         </div>
      </>
   )
}

export default Settings
