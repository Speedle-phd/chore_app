import { useId, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import FormAlert from '@/features/auth/FormAlert'
import PasswordInput from '@/features/auth/PasswordInput'
import { useDeleteAccount, useDeletionCheck } from './accountApi'

const names = (list: { name: string }[]) => list.map((h) => h.name).join(', ')

/** Permanently deletes the account after showing what happens and asking for the password. */
const DeleteAccountSection = () => {
   const [open, setOpen] = useState(false)
   const [password, setPassword] = useState('')
   const check = useDeletionCheck(open)
   const remove = useDeleteAccount()
   const navigate = useNavigate()
   const passwordId = useId()
   const plan = check.data
   const blocked = Boolean(plan?.blockedBy.length)

   return (
      <Dialog
         open={open}
         onOpenChange={(next) => {
            if (remove.isPending) return
            setOpen(next)
            if (!next) {
               setPassword('')
               remove.reset()
            }
         }}
      >
         <DialogTrigger
            render={
               <Button variant='destructive'>
                  <Trash2 />
                  Delete my account
               </Button>
            }
         />
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle className='text-lg font-semibold'>Delete your account?</DialogTitle>
               <DialogDescription>This is permanent. Your account, picture and sign-ins are deleted.</DialogDescription>
            </DialogHeader>

            {check.isPending ? (
               <div role='status' className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <Loader2 className='size-4 animate-spin' />
                  Checking your households…
               </div>
            ) : check.isError ? (
               <FormAlert tone='error' error={apiError(check.error)} />
            ) : blocked ? (
               <FormAlert
                  tone='error'
                  error={{
                     message: `You’re the only owner of ${names(plan?.blockedBy ?? [])}.`,
                     details: ['Make someone else owner (Members page), or delete the household in Settings first.'],
                  }}
               >
                  <Link to='/members' className='font-medium underline underline-offset-4' onClick={() => setOpen(false)}>
                     Go to Members
                  </Link>
               </FormAlert>
            ) : (
               <form
                  id='delete-account'
                  noValidate
                  className='space-y-4'
                  onSubmit={(e) => {
                     e.preventDefault()
                     if (!password) return
                     remove.mutate(password, { onSuccess: () => navigate('/login', { replace: true }) })
                  }}
               >
                  <ul className='list-disc space-y-1 pl-5 text-sm text-muted-foreground'>
                     {plan?.willDelete.length ? (
                        <li>
                           <span className='font-medium text-destructive'>Deleted with it:</span> {names(plan.willDelete)}{' '}
                           (you’re the only one there with a login), including its profiles.
                        </li>
                     ) : null}
                     {plan?.willLeave.length ? <li>You leave: {names(plan.willLeave)}.</li> : null}
                     <li>Invitations you sent stop working.</li>
                  </ul>
                  {remove.isError && <FormAlert tone='error' error={apiError(remove.error)} />}
                  <div className='space-y-1.5'>
                     <Label htmlFor={passwordId}>Enter your password to confirm</Label>
                     <PasswordInput
                        id={passwordId}
                        autoComplete='current-password'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                     />
                  </div>
               </form>
            )}

            <DialogFooter className='-mx-4 -mb-4'>
               <Button variant='outline' onClick={() => setOpen(false)} disabled={remove.isPending}>
                  Cancel
               </Button>
               {!blocked && !check.isPending && !check.isError && (
                  <Button
                     type='submit'
                     form='delete-account'
                     className='bg-destructive text-white hover:bg-destructive/90'
                     disabled={!password || remove.isPending}
                  >
                     {remove.isPending ? 'Deleting…' : 'Delete account forever'}
                  </Button>
               )}
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}

export default DeleteAccountSection
