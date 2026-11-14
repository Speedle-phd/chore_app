import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import type { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'

const schema = z.object({ name: z.string().trim().min(1, 'Enter a name.').max(60, 'Use at most 60 characters.') })
type Values = z.infer<typeof schema>

type HouseholdNameFormProps = {
   defaultName?: string
   submitLabel: string
   pendingLabel: string
   isPending: boolean
   error: ApiError | null
   onSubmit: (name: string) => void
   autoFocus?: boolean
}

/** Name field used for creating and renaming a household. */
const HouseholdNameForm = ({
   defaultName = '',
   submitLabel,
   pendingLabel,
   isPending,
   error,
   onSubmit,
   autoFocus,
}: HouseholdNameFormProps) => {
   const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: defaultName } })
   return (
      <form noValidate className='space-y-4' onSubmit={form.handleSubmit(({ name }) => onSubmit(name))}>
         {error && <FormAlert tone='error' error={error} />}
         <Controller
            name='name'
            control={form.control}
            render={({ field, fieldState }) => (
               <Field data-invalid={fieldState.invalid} className='gap-1.5'>
                  <FieldLabel htmlFor='household-name'>Household name</FieldLabel>
                  <Input
                     {...field}
                     id='household-name'
                     autoComplete='off'
                     autoFocus={autoFocus}
                     placeholder='e.g. The Schnuffis'
                     aria-invalid={fieldState.invalid}
                     aria-describedby='household-name-hint'
                     className='h-10'
                  />
                  <FieldDescription id='household-name-hint' className='text-xs'>
                     Everyone in the household sees this name.
                  </FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
               </Field>
            )}
         />
         <Button type='submit' size='lg' className='h-10 w-full' disabled={isPending}>
            {isPending ? pendingLabel : submitLabel}
         </Button>
      </form>
   )
}

export default HouseholdNameForm
