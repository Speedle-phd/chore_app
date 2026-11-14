import { useEffect, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useResendVerification } from './authApi'
import FormAlert from './FormAlert'

const RESEND_WAIT_SECONDS = 60

type CheckInboxProps = { email: string; onChangeEmail?: () => void }

/** Shown after signup: where the email went, and a rate-limited resend. */
const CheckInbox = ({ email, onChangeEmail }: CheckInboxProps) => {
   const resend = useResendVerification()
   const [wait, setWait] = useState(RESEND_WAIT_SECONDS)

   useEffect(() => {
      if (wait <= 0) return
      const timer = setTimeout(() => setWait((w) => w - 1), 1000)
      return () => clearTimeout(timer)
   }, [wait])

   return (
      <div className='space-y-5 text-center'>
         <span className='mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary'>
            <MailCheck className='size-6' />
         </span>
         <p className='text-sm text-muted-foreground'>
            We sent a confirmation link to
            <span className='my-1 block font-medium break-all text-foreground'>{email}</span>
            Open it to finish signing up. The link is valid for 24 hours.
         </p>
         {resend.isError && <FormAlert tone='error' error={apiError(resend.error)} />}
         {resend.isSuccess && wait > 0 && <FormAlert tone='success'>We sent another link.</FormAlert>}
         <div className='flex flex-col gap-2'>
            <Button
               type='button'
               variant='outline'
               size='lg'
               className='h-10'
               disabled={wait > 0 || resend.isPending}
               onClick={() => resend.mutate(email, { onSuccess: () => setWait(RESEND_WAIT_SECONDS) })}
            >
               {wait > 0 ? `Resend email in ${wait}s` : resend.isPending ? 'Sending…' : 'Resend email'}
            </Button>
            {onChangeEmail && (
               <Button type='button' variant='ghost' onClick={onChangeEmail}>
                  Use a different email
               </Button>
            )}
         </div>
         <p className='text-xs text-muted-foreground'>
            No email? Check your spam folder.
         </p>
      </div>
   )
}

export default CheckInbox
