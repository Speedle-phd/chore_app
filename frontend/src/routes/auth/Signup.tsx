import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import * as z from 'zod'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
   Field,
   FieldDescription,
   FieldError,
   FieldGroup,
   FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PASSWORD_MIN_LENGTH, useSignup } from '@/features/auth/authApi'
import CheckInbox from '@/features/auth/CheckInbox'
import FormAlert from '@/features/auth/FormAlert'
import PasswordInput from '@/features/auth/PasswordInput'
import AuthLayout from '@/layout/AuthLayout'
import { cn } from '@/lib/utils'

const schema = z.object({
   fname: z.string().trim().min(1, 'Enter your first name.').max(50),
   lname: z.string().trim().min(1, 'Enter your last name.').max(50),
   email: z.string().trim().pipe(z.email('Enter a valid email address.')),
   password: z
      .string()
      .refine((value) => [...value].length >= PASSWORD_MIN_LENGTH, {
         message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      }),
})
type Values = z.infer<typeof schema>

const Signup = () => {
   const signup = useSignup()
   const [sentTo, setSentTo] = useState<string | null>(null)
   const form = useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: { fname: '', lname: '', email: '', password: '' },
   })
   const password = useWatch({ control: form.control, name: 'password' })
   const length = [...password].length

   if (sentTo) {
      return (
         <AuthLayout title='Check your inbox'>
            <CheckInbox
               email={sentTo}
               onChangeEmail={() => {
                  setSentTo(null)
                  signup.reset()
               }}
            />
         </AuthLayout>
      )
   }

   const nameField = (name: 'fname' | 'lname', label: string, autoComplete: string) => (
      <Controller
         name={name}
         control={form.control}
         render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className='gap-1.5'>
               <FieldLabel htmlFor={name}>{label}</FieldLabel>
               <Input
                  {...field}
                  id={name}
                  autoComplete={autoComplete}
                  aria-invalid={fieldState.invalid}
                  className='h-10'
               />
               {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
         )}
      />
   )

   return (
      <AuthLayout
         title='Create your account'
         description='Share chores, plans and groceries with your household.'
         footer={
            <>
               Already have an account?{' '}
               <Link to='/login' className='font-medium text-primary underline-offset-4 hover:underline'>
                  Sign in
               </Link>
            </>
         }
      >
         <form
            noValidate
            onSubmit={form.handleSubmit((values) =>
               signup.mutate(values, { onSuccess: () => setSentTo(values.email.trim()) }),
            )}
            className='space-y-5'
         >
            {signup.isError && <FormAlert tone='error' error={apiError(signup.error)} />}

            <FieldGroup className='gap-4'>
               <div className='grid grid-cols-2 gap-3'>
                  {nameField('fname', 'First name', 'given-name')}
                  {nameField('lname', 'Last name', 'family-name')}
               </div>
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
                           inputMode='email'
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
                           autoComplete='new-password'
                           aria-invalid={fieldState.invalid}
                           aria-describedby='password-hint'
                        />
                        <FieldDescription id='password-hint' className='flex justify-between gap-2 text-xs'>
                           <span>A long passphrase is easiest: a few random words work well.</span>
                           <span
                              className={cn(
                                 'shrink-0 tabular-nums',
                                 length >= PASSWORD_MIN_LENGTH && 'text-primary',
                              )}
                           >
                              {length}/{PASSWORD_MIN_LENGTH}
                           </span>
                        </FieldDescription>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                     </Field>
                  )}
               />
            </FieldGroup>

            <Button type='submit' size='lg' className='h-10 w-full' disabled={signup.isPending}>
               {signup.isPending ? 'Creating account…' : 'Create account'}
            </Button>
         </form>
      </AuthLayout>
   )
}

export default Signup
