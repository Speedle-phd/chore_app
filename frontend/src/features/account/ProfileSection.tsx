import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import * as z from 'zod'
import { apiError } from '@/api/client'
import AvatarField from '@/components/AvatarField'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/auth/authApi'
import { fromParts, toParts, type BirthdayParts } from '@/features/households/birthday'
import { BirthdayField } from '@/features/households/BirthdayField'
import FormAlert from '@/features/auth/FormAlert'
import { useRemoveAvatar, useSetAvatar, useUpdateAccount } from './accountApi'

const schema = z.object({
   fname: z.string().trim().min(1, 'Enter your first name.').max(50),
   lname: z.string().trim().min(1, 'Enter your last name.').max(50),
   birthday: z.custom<BirthdayParts>().refine((b) => fromParts(b) !== null, 'Enter a full date, or leave all three empty.'),
})
type Values = z.infer<typeof schema>

/** Your picture (saved as soon as it's cropped) and your name. */
const ProfileSection = () => {
   const { data: me } = useMe()
   const setAvatar = useSetAvatar()
   const removeAvatar = useRemoveAvatar()
   const update = useUpdateAccount()
   const [uploading, setUploading] = useState<File | undefined>()
   const form = useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: { fname: me?.fname ?? '', lname: me?.lname ?? '', birthday: toParts(me?.birthday) },
   })
   if (!me) return null

   const nameField = (name: 'fname' | 'lname', label: string, autoComplete: string) => (
      <Controller
         name={name}
         control={form.control}
         render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className='gap-1.5'>
               <FieldLabel htmlFor={`account-${name}`}>{label}</FieldLabel>
               <Input {...field} id={`account-${name}`} autoComplete={autoComplete} aria-invalid={fieldState.invalid} className='h-10' />
               {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
         )}
      />
   )

   return (
      <div className='space-y-6'>
         <div className='space-y-2'>
            <AvatarField
               label='Your picture'
               value={uploading}
               existingUrl={me.avatarUrl}
               onChange={(file) => {
                  if (!file) return setUploading(undefined)
                  setUploading(file)
                  setAvatar.mutate(file, {
                     onSuccess: () => toast.success('Picture updated'),
                     onError: (e) => toast.error(apiError(e).message),
                     onSettled: () => setUploading(undefined),
                  })
               }}
            />
            {me.avatarUrl && !uploading && (
               <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='text-muted-foreground hover:text-destructive'
                  disabled={removeAvatar.isPending}
                  onClick={() =>
                     removeAvatar.mutate(undefined, {
                        onSuccess: () => toast.success('Picture removed'),
                        onError: (e) => toast.error(apiError(e).message),
                     })
                  }
               >
                  <Trash2 />
                  Remove picture
               </Button>
            )}
            {setAvatar.isPending && (
               <p role='status' className='text-xs text-muted-foreground'>
                  Uploading…
               </p>
            )}
         </div>

         <form
            noValidate
            className='space-y-4'
            onSubmit={form.handleSubmit(({ birthday, ...values }) =>
               update.mutate(
                  { ...values, birthday: fromParts(birthday) || null },
                  {
                     onSuccess: (user) => {
                        form.reset({ fname: user.fname, lname: user.lname, birthday: toParts(user.birthday) })
                        toast.success('Profile saved')
                     },
                  },
               ),
            )}
         >
            {update.isError && <FormAlert tone='error' error={apiError(update.error)} />}
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
               {nameField('fname', 'First name', 'given-name')}
               {nameField('lname', 'Last name', 'family-name')}
            </div>
            <Controller
               name='birthday'
               control={form.control}
               render={({ field, fieldState }) => (
                  <BirthdayField value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
               )}
            />
            <div className='space-y-1'>
               <p className='text-sm font-medium'>Email</p>
               <p className='text-sm text-muted-foreground'>{me.email}</p>
            </div>
            <Button type='submit' disabled={!form.formState.isDirty || update.isPending}>
               {update.isPending ? 'Saving…' : 'Save profile'}
            </Button>
         </form>
      </div>
   )
}

export default ProfileSection
