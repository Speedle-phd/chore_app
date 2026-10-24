import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import {
   Field,
   // FieldDescription,
   FieldError,
   FieldGroup,
   FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
// import {
//    InputGroup,
//    InputGroupAddon,
//    InputGroupText,
//    InputGroupTextarea,
// } from '@/components/ui/input-group'
import * as z from 'zod'
import { Button } from './ui/button'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'

const roles = ['admin', 'member'] as const
const formSchema = z.object({
   lname: z
      .string()
      .min(2, 'Last name must be at least 2 characters.')
      .max(30, 'Last name must be at most 30 characters.'),
   fname: z
      .string()
      .min(2, 'First name must be at least 2 characters.')
      .max(30, 'First name must be at most 30 characters.'),
   email: z.string().email('Please enter a valid email address.'),
   handle: z
      .string()
      .min(2, 'Handle must be at least 2 characters.')
      .max(30, 'Handle must be at most 30 characters.'),
   //single value enum for role selection
   role: z.enum(roles),
   avatarUrl: z
      .union([z.url('Please enter a valid URL for the avatar.'), z.literal('')])
      .optional(),
})

const CreateMemberForm = () => {
   const form = useForm<z.infer<typeof formSchema>>({
      resolver: zodResolver(formSchema),
      defaultValues: {
         fname: '',
         lname: '',
         email: '',
         handle: '',
         role: 'member',
         avatarUrl: '',
      },
   })
   function onSubmit(data: z.infer<typeof formSchema>) {
      console.log(data)
   }

   return (
      <div>
         <form id='create-member' onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup>
               <Controller
                  name='lname'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor='last-name'>Last name</FieldLabel>
                        <Input
                           {...field}
                           id='last-name'
                           aria-invalid={fieldState.invalid}
                           placeholder='Last name...'
                           autoComplete='off'
                        />
                        {fieldState.invalid && (
                           <FieldError errors={[fieldState.error]} />
                        )}
                     </Field>
                  )}
               />
               <Controller
                  name='fname'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor='first-name'>First name</FieldLabel>
                        <Input
                           {...field}
                           id='first-name'
                           aria-invalid={fieldState.invalid}
                           placeholder='First name...'
                           autoComplete='off'
                        />
                        {fieldState.invalid && (
                           <FieldError errors={[fieldState.error]} />
                        )}
                     </Field>
                  )}
               />
               <Controller
                  name='handle'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor='handle'>Handle</FieldLabel>
                        <Input
                           {...field}
                           id='handle'
                           aria-invalid={fieldState.invalid}
                           placeholder='Handle...'
                           autoComplete='off'
                        />
                        {fieldState.invalid && (
                           <FieldError errors={[fieldState.error]} />
                        )}
                     </Field>
                  )}
               />
               <Controller
                  name='email'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor='email'>Email</FieldLabel>
                        <Input
                           {...field}
                           id='email'
                           aria-invalid={fieldState.invalid}
                           placeholder='Email...'
                           autoComplete='on'
                        />
                        {fieldState.invalid && (
                           <FieldError errors={[fieldState.error]} />
                        )}
                     </Field>
                  )}
               />
               <Controller
                  name='role'
                  control={form.control}
                  render={({ field, fieldState }) => (
                     <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Role</FieldLabel>

                        <RadioGroup
                           value={field.value}
                           onValueChange={field.onChange}
                           className='flex gap-4'
                           aria-label='Select role'
                        >
                           <div className='flex items-center gap-2'>
                              <RadioGroupItem value='admin' id='role-admin' />
                              <FieldLabel
                                 htmlFor='role-admin'
                                 className='font-normal'
                              >
                                 Admin
                              </FieldLabel>
                           </div>

                           <div className='flex items-center gap-2'>
                              <RadioGroupItem value='member' id='role-member' />
                              <FieldLabel
                                 htmlFor='role-member'
                                 className='font-normal'
                              >
                                 Member
                              </FieldLabel>
                           </div>
                        </RadioGroup>

                        {fieldState.invalid && (
                           <FieldError errors={[fieldState.error]} />
                        )}
                     </Field>
                  )}
               />
            </FieldGroup>
         </form>
         <Field orientation='horizontal'>
            <Button
               type='button'
               variant='outline'
               onClick={() => form.reset()}
            >
               Reset
            </Button>
            <Button type='submit' form='create-member' className={'bg-theme'}>
               Submit
            </Button>
         </Field>
      </div>
   )
}

export default CreateMemberForm
