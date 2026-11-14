import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser'
import { KeyRound } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import * as z from 'zod'
import { apiError, ME_KEY, type ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { safeNextPath, useLogin } from '@/features/auth/authApi'
import FormAlert from '@/features/auth/FormAlert'
import { isCancelled, passkeyErrorMessage, signInWithPasskey, usePasskeyLogin } from '@/features/auth/passkeysApi'
import PasswordInput from '@/features/auth/PasswordInput'
import AuthLayout from '@/layout/AuthLayout'

const schema = z.object({
   email: z.string().trim().pipe(z.email('Enter a valid email address.')),
   password: z.string().min(1, 'Enter your password.'),
})
type Values = z.infer<typeof schema>

const Login = () => {
   const navigate = useNavigate()
   const [params] = useSearchParams()
   const login = useLogin()
   const form = useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: { email: '', password: '' },
   })

   const queryClient = useQueryClient()
   const passkey = usePasskeyLogin()
   const [passkeyError, setPasskeyError] = useState<ApiError | null>(null)
   const supportsPasskeys = browserSupportsWebAuthn()
   const goOn = () => navigate(safeNextPath(params.get('next')), { replace: true })

   function showPasskeyError(e: unknown) {
      if (isCancelled(e)) return // closing the prompt isn't an error
      setPasskeyError({ message: passkeyErrorMessage(e) ?? apiError(e).message })
   }

   // Offer saved passkeys right in the email field's autofill suggestions.
   useEffect(() => {
      let active = true
      void browserSupportsWebAuthnAutofill().then(async (supported) => {
         if (!supported || !active) return
         try {
            const user = await signInWithPasskey(true)
            queryClient.setQueryData(ME_KEY, user)
            goOn()
         } catch (e) {
            // A newer passkey request (the button) aborts this one; that's expected.
            if (active) showPasskeyError(e)
         }
      })
      return () => {
         active = false
      }
      // Runs once per visit; the autofill request stays open until used or aborted.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [])

   const error = login.isError ? apiError(login.error) : passkeyError
   const notVerified = error?.code === 'EMAIL_NOT_VERIFIED'

   return (
      <AuthLayout
         title='Welcome back'
         description='Sign in to your household.'
         footer={
            <>
               New to Hearth?{' '}
               <Link to='/signup' className='font-medium text-primary underline-offset-4 hover:underline'>
                  Create an account
               </Link>
            </>
         }
      >
         <form
            noValidate
            onSubmit={form.handleSubmit((values) =>
               login.mutate(values, { onSuccess: goOn }),
            )}
            className='space-y-5'
         >
            {error &&
               (notVerified ? (
                  <FormAlert tone='success'>{error.message}</FormAlert>
               ) : (
                  <FormAlert tone='error' error={error} />
               ))}

            <FieldGroup className='gap-4'>
               <Controller
                  name='email'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <Field data-invalid={fieldState.invalid} className='gap-1.5'>
                        <FieldLabel htmlFor='email'>Email</FieldLabel>
                        <Input
                           {...field}
                           id='email'
                           type='email'
                           autoComplete='email webauthn'
                           inputMode='email'
                           autoFocus
                           aria-invalid={fieldState.invalid}
                           className='h-10'
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                     </Field>
                  )}
               />
               <Controller
                  name='password'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <Field data-invalid={fieldState.invalid} className='gap-1.5'>
                        <FieldLabel htmlFor='password'>Password</FieldLabel>
                        <PasswordInput
                           {...field}
                           id='password'
                           autoComplete='current-password'
                           aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        <Link
                           to='/forgot-password'
                           className='self-end text-xs font-medium text-primary underline-offset-4 hover:underline'
                        >
                           Forgot password?
                        </Link>
                     </Field>
                  )}
               />
            </FieldGroup>

            <Button type='submit' size='lg' className='h-10 w-full' disabled={login.isPending}>
               {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>

            {supportsPasskeys && (
               <>
                  <div className='flex items-center gap-3 text-xs text-muted-foreground' aria-hidden>
                     <span className='h-px flex-1 bg-border' />
                     or
                     <span className='h-px flex-1 bg-border' />
                  </div>
                  <Button
                     type='button'
                     variant='outline'
                     size='lg'
                     className='h-10 w-full'
                     disabled={passkey.isPending}
                     onClick={() => {
                        setPasskeyError(null)
                        login.reset()
                        passkey.mutate(undefined, { onSuccess: goOn, onError: showPasskeyError })
                     }}
                  >
                     <KeyRound />
                     {passkey.isPending ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
                  </Button>
               </>
            )}
         </form>
      </AuthLayout>
   )
}

export default Login
