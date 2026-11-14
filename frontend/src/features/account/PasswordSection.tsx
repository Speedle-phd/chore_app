import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import * as z from 'zod'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { PASSWORD_MIN_LENGTH, useMe } from '@/features/auth/authApi'
import FormAlert from '@/features/auth/FormAlert'
import PasswordInput from '@/features/auth/PasswordInput'
import { cn } from '@/lib/utils'
import { useChangePassword } from './accountApi'

const schema = z.object({
   currentPassword: z.string().min(1, 'Enter your current password.'),
   newPassword: z.string().refine((v) => [...v].length >= PASSWORD_MIN_LENGTH, {
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
   }),
})
type Values = z.infer<typeof schema>

const PasswordSection = () => {
   const { data: me } = useMe()
   const change = useChangePassword()
   const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '' } })
   const length = [...useWatch({ control: form.control, name: 'newPassword' })].length

   return (
      <form
         noValidate
         className='space-y-4'
         onSubmit={form.handleSubmit((values) =>
            change.mutate(values, {
               onSuccess: () => {
                  form.reset()
                  toast.success('Password changed. Your other devices were signed out.')
               },
            }),
         )}
      >
         {change.isError && <FormAlert tone='error' error={apiError(change.error)} />}
         {/* Hidden username helps password managers update the right entry. */}
         <input type='email' name='username' autoComplete='username' value={me?.email ?? ''} readOnly hidden />
         <Controller
            name='currentPassword'
            control={form.control}
            render={({ field, fieldState }) => (
               <Field data-invalid={fieldState.invalid} className='gap-1.5'>
                  <FieldLabel htmlFor='current-password'>Current password</FieldLabel>
                  <PasswordInput {...field} id='current-password' autoComplete='current-password' aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
               </Field>
            )}
         />
         <Controller
            name='newPassword'
            control={form.control}
            render={({ field, fieldState }) => (
               <Field data-invalid={fieldState.invalid} className='gap-1.5'>
                  <FieldLabel htmlFor='new-password'>New password</FieldLabel>
                  <PasswordInput
                     {...field}
                     id='new-password'
                     autoComplete='new-password'
                     aria-invalid={fieldState.invalid}
                     aria-describedby='new-password-hint'
                  />
                  <FieldDescription id='new-password-hint' className='flex justify-between gap-2 text-xs'>
                     <span>Changing it signs out your other devices.</span>
                     <span className={cn('shrink-0 tabular-nums', length >= PASSWORD_MIN_LENGTH && 'text-primary')}>
                        {length}/{PASSWORD_MIN_LENGTH}
                     </span>
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
               </Field>
            )}
         />
         <Button type='submit' disabled={change.isPending}>
            {change.isPending ? 'Changing…' : 'Change password'}
         </Button>
      </form>
   )
}

export default PasswordSection
