import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import * as z from 'zod'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useForgotPassword } from '@/features/auth/authApi'
import FormAlert from '@/features/auth/FormAlert'
import AuthLayout from '@/layout/AuthLayout'

const schema = z.object({
   email: z.string().trim().pipe(z.email('Enter a valid email address.')),
})
type Values = z.infer<typeof schema>

const ForgotPassword = () => {
   const forgot = useForgotPassword()
   const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

   return (
      <AuthLayout
         title='Reset your password'
         description='Enter the email you signed up with. We’ll send you a link to choose a new password.'
         footer={
            <Link to='/login' className='font-medium text-primary underline-offset-4 hover:underline'>
               Back to sign in
            </Link>
         }
      >
         {forgot.isSuccess ? (
            <FormAlert tone='success'>
               If an account exists for {form.getValues('email')}, you’ll get an email with a link.
               It works once and expires in 30 minutes.
            </FormAlert>
         ) : (
            <form
               noValidate
               className='space-y-4'
               onSubmit={form.handleSubmit(({ email }) => forgot.mutate(email))}
            >
               {forgot.isError && <FormAlert tone='error' error={apiError(forgot.error)} />}
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
                           autoComplete='email'
                           autoFocus
                           aria-invalid={fieldState.invalid}
                           className='h-10'
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                     </Field>
                  )}
               />
               <Button type='submit' size='lg' className='h-10 w-full' disabled={forgot.isPending}>
                  {forgot.isPending ? 'Sending…' : 'Send reset link'}
               </Button>
            </form>
         )}
      </AuthLayout>
   )
}

export default ForgotPassword
