import { useState } from 'react'
import { ArrowLeft, Eye, House, RefreshCw } from 'lucide-react'
import { Link, useBlocker } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError, type ApiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import FormAlert from '@/features/auth/FormAlert'
import { useSaveGuestInfo, useGuestInfo, type GuestContent, type GuestInfo } from '@/features/guest/guestApi'
import { GuestForm } from '@/features/guest/GuestForm'
import { GuestPageEmpty, GuestPageView } from '@/features/guest/GuestPageView'
import { filledSections, normalizeContent, readableProblem } from '@/features/guest/guestText'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'

const contentOf = ({ updatedAt: _u, ...content }: GuestInfo): GuestContent => content
const same = (a: GuestContent, b: GuestContent) => JSON.stringify(normalizeContent(a)) === JSON.stringify(normalizeContent(b))

/** Settings → Guest page: managers edit what guests see; members read it. */
export default function GuestEditor() {
   const household = useHousehold()
   const manager = canManage(household.role)
   const info = useGuestInfo(household.id)
   const members = useMembers(household.id)
   const save = useSaveGuestInfo(household.id)
   const [draft, setDraft] = useState<GuestContent | null>(null)
   const [error, setError] = useState<ApiError | null>(null)
   const [preview, setPreview] = useState(false)

   // Start the draft once the saved content is there (adjusting state while rendering, no effect).
   if (draft === null && info.data) setDraft(contentOf(info.data))
   const saved = info.data ? contentOf(info.data) : null
   const dirty = Boolean(manager && draft && saved && !same(draft, saved))
   const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

   const header = (
      <>
         <Link to='/settings' className='mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline'>
            <ArrowLeft className='size-4' aria-hidden />
            Settings
         </Link>
         <PageHeader
            title='Guest page'
            Icon={House}
            description={manager ? 'What a babysitter or house sitter needs. Share it with a link from Settings.' : 'What guests see. Owners and admins change it and share it.'}
            action={
               draft && (
                  <Button variant='outline' onClick={() => setPreview(true)}>
                     <Eye />
                     Preview as a guest
                  </Button>
               )
            }
         />
      </>
   )

   if (info.isPending || !draft) {
      return (
         <>
            {header}
            {info.isError ? (
               <div role='alert' className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm'>
                  <span>Couldn’t load the guest page: {apiError(info.error).message}</span>
                  <Button variant='outline' size='sm' onClick={() => void info.refetch()}>
                     <RefreshCw />
                     Try again
                  </Button>
               </div>
            ) : (
               <div role='status' aria-label='Loading' className='h-64 animate-pulse rounded-2xl bg-muted' />
            )}
         </>
      )
   }

   // Managers preview their draft; members always see the saved (live) content.
   const page = filledSections(normalizeContent(manager || !saved ? draft : saved))
   const submit = () => {
      setError(null)
      save.mutate(normalizeContent(draft), {
         onSuccess: (info) => {
            setDraft(contentOf(info))
            toast.success('Guest page saved')
         },
         onError: (e) => {
            const problem = apiError(e)
            setError({ ...problem, ...(problem.details ? { details: problem.details.map(readableProblem) } : {}) })
         },
      })
   }

   return (
      <>
         {header}
         {manager ? (
            <form
               className='space-y-5'
               onSubmit={(e) => {
                  e.preventDefault()
                  submit()
               }}
            >
               <GuestForm value={draft} onChange={setDraft} members={members.data ?? []} />
               {error && <FormAlert tone='error' error={error} />}
               <div className='sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-t-2xl border-t bg-background/95 px-1 py-3 backdrop-blur'>
                  {dirty && <span className='me-auto text-sm text-muted-foreground'>Unsaved changes</span>}
                  <Button
                     type='button'
                     variant='ghost'
                     disabled={!dirty || save.isPending}
                     onClick={() => {
                        if (saved) setDraft(saved)
                        setError(null)
                     }}
                  >
                     Discard
                  </Button>
                  <Button type='submit' disabled={!dirty || save.isPending}>
                     {save.isPending ? 'Saving…' : 'Save'}
                  </Button>
               </div>
            </form>
         ) : Object.keys(page).length ? (
            <GuestPageView sections={page} />
         ) : (
            <GuestPageEmpty />
         )}

         <Dialog open={preview} onOpenChange={setPreview}>
            <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-2xl'>
               <DialogHeader>
                  <DialogTitle>Preview: Welcome to {household.name}</DialogTitle>
                  <DialogDescription>
                     {manager ? 'Everything filled in, including unsaved changes. Each link shows only its chosen sections.' : 'Each link shows only the sections chosen for it.'}
                  </DialogDescription>
               </DialogHeader>
               {Object.keys(page).length ? <GuestPageView sections={page} /> : <GuestPageEmpty />}
            </DialogContent>
         </Dialog>

         <ConfirmDeleteDialog
            open={blocker.state === 'blocked'}
            onOpenChange={(open) => {
               if (!open && blocker.state === 'blocked') blocker.reset()
            }}
            title='Leave without saving?'
            description='Your changes to the guest page are lost.'
            confirmLabel='Leave'
            onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
         />
      </>
   )
}
