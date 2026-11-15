import { useId, useState } from 'react'
import { AtSign } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMe } from '@/features/auth/authApi'
import FormAlert from '@/features/auth/FormAlert'
import { useUpdateAccount } from './accountApi'

const HANDLE_PATTERN = /^[a-z0-9._]{3,30}$/

/** Your @handle and whether others may find you by it (off by default). */
const HandleForm = () => {
   const { data: me } = useMe()
   const update = useUpdateAccount()
   const [handle, setHandle] = useState(me?.handle ?? '')
   const [findable, setFindable] = useState(me?.findableByHandle ?? false)
   const [touched, setTouched] = useState(false)
   const handleId = useId()
   const findableId = useId()

   const normalized = handle.trim().replace(/^@/, '').toLowerCase()
   const invalid = normalized !== '' && !HANDLE_PATTERN.test(normalized)
   const changed = normalized !== (me?.handle ?? '') || findable !== me?.findableByHandle

   return (
      <form
         noValidate
         className='space-y-4'
         onSubmit={(e) => {
            e.preventDefault()
            setTouched(true)
            if (invalid) return
            update.mutate(
               { handle: normalized || null, findableByHandle: findable && normalized !== '' },
               { onSuccess: () => toast.success('Account updated') },
            )
         }}
      >
         {update.isError && <FormAlert tone='error' error={apiError(update.error)} />}
         <div className='space-y-1.5'>
            <Label htmlFor={handleId}>Your @handle</Label>
            <div className='relative'>
               <AtSign className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
               <Input
                  id={handleId}
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete='username'
                  spellCheck={false}
                  aria-invalid={touched && invalid}
                  aria-describedby={`${handleId}-hint`}
                  className='h-10 pl-9'
               />
            </div>
            <p id={`${handleId}-hint`} className={touched && invalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
               3–30 letters, digits, dots or underscores.
            </p>
         </div>

         <label htmlFor={findableId} className='flex cursor-pointer items-start gap-3 rounded-xl border p-3'>
            <Checkbox
               id={findableId}
               checked={findable && normalized !== ''}
               disabled={normalized === ''}
               onCheckedChange={(checked) => setFindable(checked)}
               className='mt-0.5'
            />
            <span className='text-sm'>
               <span className='block font-medium'>Let others find me by my @handle</span>
               <span className='block text-muted-foreground'>
                  {normalized === ''
                     ? 'Choose a handle first.'
                     : 'Only someone who types your exact handle can find you; they see your name and handle, nothing else.'}
               </span>
            </span>
         </label>

         <Button type='submit' disabled={!changed || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
         </Button>
      </form>
   )
}

export default HandleForm
