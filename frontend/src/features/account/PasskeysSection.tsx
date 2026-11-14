import { useId, useState } from 'react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { Cloud, KeyRound, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import DeleteButton from '@/components/DeleteButton'
import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import FormAlert from '@/features/auth/FormAlert'
import {
   isCancelled,
   passkeyErrorMessage,
   useAddPasskey,
   usePasskeys,
   useRemovePasskey,
   useRenamePasskey,
   type Passkey,
} from '@/features/auth/passkeysApi'
import { describeDevice } from '@/lib/userAgent'

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Mounted per passkey (keyed by id), so the field always starts with its current name. */
function RenameDialog({ passkey, onClose }: { passkey: Passkey; onClose: () => void }) {
   const rename = useRenamePasskey()
   const [name, setName] = useState(passkey.name)
   const inputId = useId()
   return (
      <Dialog
         open
         onOpenChange={(open) => {
            if (!open) onClose()
         }}
      >
         <DialogContent className='sm:max-w-sm'>
            <DialogHeader>
               <DialogTitle className='text-lg font-semibold'>Rename passkey</DialogTitle>
               <DialogDescription>A name that helps you recognise the device, e.g. “Work laptop”.</DialogDescription>
            </DialogHeader>
            <form
               id='rename-passkey'
               noValidate
               onSubmit={(e) => {
                  e.preventDefault()
                  if (!name.trim()) return
                  rename.mutate({ id: passkey.id, name: name.trim() }, { onSuccess: onClose })
               }}
               className='space-y-3'
            >
               {rename.isError && <FormAlert tone='error' error={apiError(rename.error)} />}
               <div className='space-y-1.5'>
                  <Label htmlFor={inputId}>Name</Label>
                  <Input
                     id={inputId}
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     maxLength={60}
                     className='h-10'
                     autoFocus
                  />
               </div>
            </form>
            <DialogFooter className='-mx-4 -mb-4'>
               <Button variant='outline' onClick={onClose}>
                  Cancel
               </Button>
               <Button
                  type='submit'
                  form='rename-passkey'
                  disabled={!name.trim() || name.trim() === passkey.name || rename.isPending}
               >
                  {rename.isPending ? 'Saving…' : 'Save'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}

/** Passkeys of this account: add one for this device, rename or remove existing ones. */
const PasskeysSection = () => {
   const passkeys = usePasskeys()
   const add = useAddPasskey()
   const remove = useRemovePasskey()
   const [renaming, setRenaming] = useState<Passkey | null>(null)
   const [removing, setRemoving] = useState<string | null>(null)

   if (!browserSupportsWebAuthn()) {
      return <p className='text-sm text-muted-foreground'>This browser doesn’t support passkeys. Try an up-to-date browser.</p>
   }

   const addError = add.isError && !isCancelled(add.error)
      ? { message: passkeyErrorMessage(add.error) ?? apiError(add.error).message }
      : null
   const list = passkeys.data ?? []

   return (
      <div className='space-y-4'>
         <p className='text-sm text-muted-foreground'>
            Sign in with your fingerprint, face or device PIN instead of a password. Passkeys can’t be phished or leaked.
         </p>

         {passkeys.isPending ? (
            <div className='h-16 animate-pulse rounded-xl bg-muted' aria-busy='true' aria-label='Loading passkeys' />
         ) : passkeys.isError ? (
            <FormAlert tone='error' error={apiError(passkeys.error)} />
         ) : (
            list.length > 0 && (
               <ul className='divide-y rounded-xl border'>
                  {list.map((p) => (
                     <li key={p.id} className='flex items-center gap-3 px-3 py-3'>
                        <KeyRound className='size-5 shrink-0 text-muted-foreground' />
                        <span className='min-w-0 flex-1'>
                           <span className='flex items-center gap-2 text-sm font-medium'>
                              <span className='truncate'>{p.name}</span>
                              {p.backedUp && (
                                 <span
                                    className='flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground'
                                    title='Synced across your devices by your password manager'
                                 >
                                    <Cloud className='size-3' />
                                    Synced
                                 </span>
                              )}
                           </span>
                           <span className='block text-xs text-muted-foreground'>
                              Added {fmt(p.createdAt)} · {p.lastUsedAt ? `last used ${fmt(p.lastUsedAt)}` : 'not used yet'}
                           </span>
                        </span>
                        <Button
                           size='icon-sm'
                           variant='ghost'
                           className='text-muted-foreground'
                           aria-label={`Rename ${p.name}`}
                           title='Rename'
                           onClick={() => setRenaming(p)}
                        >
                           <Pencil />
                        </Button>
                        <ConfirmDeleteDialog
                           open={removing === p.id}
                           onOpenChange={(open) => setRemoving(open ? p.id : null)}
                           trigger={<DeleteButton label={`Remove ${p.name}`} />}
                           title={`Remove “${p.name}”?`}
                           description='You won’t be able to sign in with it any more. You can still use your password or another passkey.'
                           confirmLabel='Remove passkey'
                           isPending={remove.isPending}
                           onConfirm={() =>
                              remove.mutate(p.id, {
                                 onSuccess: () => {
                                    setRemoving(null)
                                    toast.success('Passkey removed')
                                 },
                                 onError: (e) => toast.error(apiError(e).message),
                              })
                           }
                        />
                     </li>
                  ))}
               </ul>
            )
         )}

         {addError && <FormAlert tone='error' error={addError} />}
         <Button
            variant='outline'
            disabled={add.isPending}
            onClick={() =>
               add.mutate(describeDevice(navigator.userAgent), {
                  onSuccess: (p) => toast.success(`Passkey “${p.name}” added`),
               })
            }
         >
            <Plus />
            {add.isPending ? 'Follow your device’s prompt…' : 'Add a passkey'}
         </Button>
         {list.length === 0 && passkeys.isSuccess && (
            <p className='text-xs text-muted-foreground'>You don’t have any passkeys yet.</p>
         )}

         {renaming && <RenameDialog key={renaming.id} passkey={renaming} onClose={() => setRenaming(null)} />}
      </div>
   )
}

export default PasskeysSection
