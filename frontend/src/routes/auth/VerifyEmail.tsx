import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useResendVerification, useVerifyEmail } from '@/features/auth/authApi'
import FormAlert from '@/features/auth/FormAlert'
import { useUrlToken } from '@/features/auth/useUrlToken'
import AuthLayout from '@/layout/AuthLayout'

const VerifyEmail = () => {
   const token = useUrlToken()
   const navigate = useNavigate()
   const verify = useVerifyEmail()
   const resend = useResendVerification()
   const [email, setEmail] = useState('')
   const started = useRef(false)

   useEffect(() => {
      // Tokens are single-use: never submit twice (StrictMode runs effects twice).
      if (!token || started.current) return
      started.current = true
      verify.mutate(token, { onSuccess: () => navigate('/', { replace: true }) })
   }, [token, verify, navigate])

   if (token && !verify.isError) {
      return (
         <AuthLayout title='Confirming your email'>
            <div role='status' className='flex items-center gap-3 text-sm text-muted-foreground'>
               <Loader2 className='size-5 animate-spin text-primary' />
               One moment…
            </div>
         </AuthLayout>
      )
   }

   return (
      <AuthLayout
         title='Link not valid'
         description='This confirmation link is invalid, expired or was already used. Enter your email and we’ll send a new one.'
         footer={
            <Link to='/login' className='font-medium text-primary underline-offset-4 hover:underline'>
               Back to sign in
            </Link>
         }
      >
         <form
            noValidate
            className='space-y-4'
            onSubmit={(event) => {
               event.preventDefault()
               if (email.trim()) resend.mutate(email.trim())
            }}
         >
            {verify.isError && !resend.isSuccess && (
               <FormAlert tone='error' error={apiError(verify.error)} />
            )}
            {resend.isError && <FormAlert tone='error' error={apiError(resend.error)} />}
            {resend.isSuccess && (
               <FormAlert tone='success'>
                  If that address has an unconfirmed account, a new link is on its way.
               </FormAlert>
            )}
            <Field className='gap-1.5'>
               <FieldLabel htmlFor='email'>Email</FieldLabel>
               <Input
                  id='email'
                  type='email'
                  autoComplete='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className='h-10'
                  required
               />
            </Field>
            <Button type='submit' size='lg' className='h-10 w-full' disabled={resend.isPending}>
               {resend.isPending ? 'Sending…' : 'Send a new link'}
            </Button>
         </form>
      </AuthLayout>
   )
}

export default VerifyEmail
