import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import * as z from 'zod'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { PASSWORD_MIN_LENGTH, useResetPassword } from '@/features/auth/authApi'
import FormAlert from '@/features/auth/FormAlert'
import PasswordInput from '@/features/auth/PasswordInput'
import { useUrlToken } from '@/features/auth/useUrlToken'
import AuthLayout from '@/layout/AuthLayout'
import { cn } from '@/lib/utils'

const schema = z.object({
   password: z.string().refine((value) => [...value].length >= PASSWORD_MIN_LENGTH, {
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
   }),
})
type Values = z.infer<typeof schema>

const requestNewLink = (
   <Link to='/forgot-password' className='font-medium underline underline-offset-4'>
      Request a new link
   </Link>
)

const ResetPassword = () => {
   const token = useUrlToken()
   const navigate = useNavigate()
   const reset = useResetPassword()
   const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } })
   const length = [...useWatch({ control: form.control, name: 'password' })].length
   const error = reset.isError ? apiError(reset.error) : null

   return (
      <AuthLayout
         title='Choose a new password'
         description='You’ll be signed in, and signed out everywhere else.'
         footer={
            <Link to='/login' className='font-medium text-primary underline-offset-4 hover:underline'>
               Back to sign in
            </Link>
         }
      >
         {!token ? (
            <FormAlert tone='error' error={{ message: 'This reset link is incomplete.' }}>
               {requestNewLink}
            </FormAlert>
         ) : (
            <form
               noValidate
               className='space-y-4'
               onSubmit={form.handleSubmit(({ password }) =>
                  reset.mutate({ token, password }, { onSuccess: () => navigate('/', { replace: true }) }),
               )}
            >
               {error && (
                  <FormAlert tone='error' error={error}>
                     {error.code === 'INVALID_TOKEN' && requestNewLink}
                  </FormAlert>
               )}
               <Controller
                  name='password'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <Field data-invalid={fieldState.invalid} className='gap-1.5'>
                        <FieldLabel htmlFor='password'>New password</FieldLabel>
                        <PasswordInput
                           {...field}
                           id='password'
                           autoComplete='new-password'
                           autoFocus
                           aria-invalid={fieldState.invalid}
                           aria-describedby='password-hint'
                        />
                        <FieldDescription id='password-hint' className='flex justify-between gap-2 text-xs'>
                           <span>A few random words make a strong, memorable passphrase.</span>
                           <span className={cn('shrink-0 tabular-nums', length >= PASSWORD_MIN_LENGTH && 'text-primary')}>
                              {length}/{PASSWORD_MIN_LENGTH}
                           </span>
                        </FieldDescription>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                     </Field>
                  )}
               />
               <Button type='submit' size='lg' className='h-10 w-full' disabled={reset.isPending}>
                  {reset.isPending ? 'Saving…' : 'Save new password'}
               </Button>
            </form>
         )}
      </AuthLayout>
   )
}

export default ResetPassword
