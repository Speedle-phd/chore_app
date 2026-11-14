import { UserRound } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import SettingsSection from '@/components/SettingsSection'
import DeleteAccountSection from '@/features/account/DeleteAccountSection'
import HandleForm from '@/features/account/HandleForm'
import PasskeysSection from '@/features/account/PasskeysSection'
import PasswordSection from '@/features/account/PasswordSection'
import ProfileSection from '@/features/account/ProfileSection'
import SessionsSection from '@/features/account/SessionsSection'

const Account = () => (
   <>
      <PageHeader title='Account' description='Your profile, sign-in and privacy.' Icon={UserRound} />
      <div className='space-y-6'>
         <div className='rounded-2xl border bg-card p-6 sm:p-8'>
            <SettingsSection title='Profile' description='How you appear to the people in your households.'>
               <ProfileSection />
            </SettingsSection>
            <SettingsSection title='Handle & privacy' description='How others can find you to invite you.'>
               <HandleForm />
            </SettingsSection>
         </div>
         <div className='rounded-2xl border bg-card p-6 sm:p-8'>
            <SettingsSection title='Password' description='Use a long passphrase you don’t use anywhere else.'>
               <PasswordSection />
            </SettingsSection>
            <SettingsSection title='Passkeys' description='Faster, phishing-proof sign-in with this device.'>
               <PasskeysSection />
            </SettingsSection>
            <SettingsSection title='Signed-in devices' description='Sign out devices you don’t recognise or no longer use.'>
               <SessionsSection />
            </SettingsSection>
         </div>
         <div className='rounded-2xl border border-destructive/30 bg-card p-6 sm:p-8'>
            <SettingsSection title='Delete account' description='Permanently remove your account and everything only you can access.'>
               <DeleteAccountSection />
            </SettingsSection>
         </div>
      </div>
   </>
)

export default Account
