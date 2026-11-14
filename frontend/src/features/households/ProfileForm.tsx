import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { apiError } from '@/api/client'
import AvatarField from '@/components/AvatarField'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import { useSaveProfile, type Member } from './householdsApi'

const schema = z.object({
   fname: z.string().trim().min(1, 'Enter a first name.').max(50),
   lname: z.string().trim().min(1, 'Enter a last name.').max(50),
   avatar: z.instanceof(File).optional(),
})
type Values = z.infer<typeof schema>

type ProfileFormProps = {
   householdId: string
   /** Edit this profile; omit to create a new one. */
   profile?: Member
   onDone: (saved: Member) => void
}

/** Name and picture of a person without a login (e.g. a child). */
const ProfileForm = ({ householdId, profile, onDone }: ProfileFormProps) => {
   const save = useSaveProfile(householdId, profile?.id)
   const form = useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: { fname: profile?.fname ?? '', lname: profile?.lname ?? '', avatar: undefined },
   })

   const nameField = (name: 'fname' | 'lname', label: string) => (
      <Controller
         name={name}
         control={form.control}
         render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className='gap-1.5'>
               <FieldLabel htmlFor={`profile-${name}`}>{label}</FieldLabel>
               <Input
                  {...field}
                  id={`profile-${name}`}
                  autoComplete='off'
                  aria-invalid={fieldState.invalid}
                  className='h-10'
               />
               {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
         )}
      />
   )

   return (
      <form
         noValidate
         className='space-y-4'
         onSubmit={form.handleSubmit((values) => save.mutate(values, { onSuccess: onDone }))}
      >
         {save.isError && <FormAlert tone='error' error={apiError(save.error)} />}
         <Controller
            name='avatar'
            control={form.control}
            render={({ field }) => (
               <AvatarField
                  label='Picture'
                  value={field.value}
                  existingUrl={profile?.avatarUrl}
                  onChange={field.onChange}
               />
            )}
         />
         <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            {nameField('fname', 'First name')}
            {nameField('lname', 'Last name')}
         </div>
         <div className='flex justify-end gap-2 border-t pt-4'>
            <Button type='submit' size='lg' className='px-4' disabled={save.isPending}>
               {save.isPending ? 'Saving…' : profile ? 'Save changes' : 'Add profile'}
            </Button>
         </div>
      </form>
   )
}

export default ProfileForm
