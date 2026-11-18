import { useState } from 'react'
import { Check, Link2, Link2Off, MoreHorizontal, Pencil, Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Household } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'
import { cn } from '@/lib/utils'
import { useCreateLink, useGuestInfo, useGuestLinks, useRemoveLink, useReplaceLink, useUpdateLink } from './guestApi'
import { filledSections } from './guestText'
import { LinkDialog, LinkReadyDialog } from './LinkDialogs'
import { GUEST_LIMITS, GUEST_SECTIONS, SECTION_LABEL, type GuestLink, type GuestSection } from './types'

const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const fail = (e: unknown) => toast.error(apiError(e).message)

/** Settings: what's on the guest page, the editor, and (owners/admins) the links that share it. */
export function GuestSection({ household }: { household: Household }) {
   const manager = canManage(household.role)
   const info = useGuestInfo(household.id)
   const links = useGuestLinks(household.id, manager)
   const create = useCreateLink(household.id)
   const update = useUpdateLink(household.id)
   const replace = useReplaceLink(household.id)
   const remove = useRemoveLink(household.id)
   const [dialog, setDialog] = useState<{ link?: GuestLink } | null>(null)
   const [ready, setReady] = useState<{ url: string; label: string } | null>(null)
   const [replacing, setReplacing] = useState<GuestLink | null>(null)
   const [removing, setRemoving] = useState<GuestLink | null>(null)

   const filled = new Set(info.data ? (Object.keys(filledSections(info.data)) as GuestSection[]) : [])

   return (
      <div className='space-y-5'>
         <div className='space-y-3'>
            <ul className='flex flex-wrap gap-1.5' aria-label='Sections'>
               {GUEST_SECTIONS.map((s) => (
                  <li
                     key={s}
                     className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs',
                        filled.has(s) ? 'border-primary/40 bg-primary/10 font-medium' : 'text-muted-foreground',
                     )}
                  >
                     {filled.has(s) && <Check className='size-3' aria-hidden />}
                     {SECTION_LABEL[s]}
                     <span className='sr-only'>{filled.has(s) ? ', filled in' : ', empty'}</span>
                  </li>
               ))}
            </ul>
            <Link to='/settings/guest' className={buttonVariants({ variant: 'outline' })}>
               {manager && <Pencil />}
               {manager ? 'Edit guest page' : 'See the guest page'}
            </Link>
         </div>

         {manager ? (
            <div className='space-y-3'>
               <h3 className='text-sm font-medium'>Links</h3>
               {links.isPending ? (
                  <div className='h-14 animate-pulse rounded-xl bg-muted' />
               ) : links.isError ? (
                  <div role='alert' className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm'>
                     <span>Couldn’t load the links: {apiError(links.error).message}</span>
                     <Button variant='outline' size='sm' onClick={() => void links.refetch()}>
                        <RefreshCw />
                        Try again
                     </Button>
                  </div>
               ) : links.data.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>No links yet. Make one for each guest, so you can turn it off when they’re done.</p>
               ) : (
                  <ul className='divide-y rounded-xl border'>
                     {links.data.map((l) => (
                        <li key={l.id} className='flex items-start gap-3 p-3'>
                           <Link2 className={cn('mt-0.5 size-4 shrink-0', l.expired ? 'text-muted-foreground' : 'text-primary')} aria-hidden />
                           <div className='min-w-0 flex-1 text-sm'>
                              <p className='font-medium break-words'>
                                 {l.label}
                                 {l.expired && <span className='ms-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground'>Expired</span>}
                              </p>
                              <p className='text-muted-foreground'>{l.sections.map((s) => SECTION_LABEL[s]).join(', ')}</p>
                              <p className='text-muted-foreground'>
                                 {l.expiresAt ? `${l.expired ? 'Ended' : 'Until'} ${dateText(l.expiresAt)}` : 'No end'}
                                 {' · '}
                                 {l.lastOpenedAt ? `last opened ${dateText(l.lastOpenedAt)}` : 'not opened yet'}
                              </p>
                           </div>
                           <DropdownMenu>
                              <DropdownMenuTrigger render={<Button variant='ghost' size='icon-sm' aria-label={`More for the link “${l.label}”`} />}>
                                 <MoreHorizontal />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align='end'>
                                 <DropdownMenuItem onClick={() => setDialog({ link: l })}>
                                    <Pencil />
                                    Change
                                 </DropdownMenuItem>
                                 <DropdownMenuItem onClick={() => setReplacing(l)}>
                                    <RefreshCw />
                                    Replace link
                                 </DropdownMenuItem>
                                 <DropdownMenuItem variant='destructive' onClick={() => setRemoving(l)}>
                                    <Link2Off />
                                    Turn off
                                 </DropdownMenuItem>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </li>
                     ))}
                  </ul>
               )}
               <Button onClick={() => setDialog({})} disabled={!links.data || links.data.length >= GUEST_LIMITS.links}>
                  <Plus />
                  New guest link
               </Button>
               {links.data && links.data.length >= GUEST_LIMITS.links && (
                  <p className='text-sm text-muted-foreground'>That’s the most ({GUEST_LIMITS.links}). Turn one off to make another.</p>
               )}
            </div>
         ) : (
            <p className='text-sm text-muted-foreground'>Owners and admins fill it in and share it with links.</p>
         )}

         {dialog && (
            <LinkDialog
               open
               onOpenChange={(open) => !open && setDialog(null)}
               link={dialog.link}
               filled={filled}
               isPending={create.isPending || update.isPending}
               onSubmit={(input, onError) => {
                  const editing = dialog.link
                  if (editing) {
                     update.mutate(
                        { id: editing.id, ...input },
                        {
                           onSuccess: () => {
                              setDialog(null)
                              toast.success('Link changed')
                           },
                           onError,
                        },
                     )
                  } else {
                     create.mutate(input, {
                        onSuccess: (made) => {
                           setDialog(null)
                           setReady({ url: made.url, label: made.label })
                        },
                        onError,
                     })
                  }
               }}
            />
         )}
         <LinkReadyDialog url={ready?.url ?? null} label={ready?.label ?? ''} onClose={() => setReady(null)} />
         <ConfirmDeleteDialog
            open={replacing !== null}
            onOpenChange={(open) => !open && setReplacing(null)}
            title={`Replace the link for ${replacing?.label ?? ''}?`}
            description='The current address stops working. You get a new one to send.'
            confirmLabel='Replace link'
            isPending={replace.isPending}
            onConfirm={() =>
               replacing &&
               replace.mutate(replacing.id, {
                  onSuccess: (made) => {
                     setReplacing(null)
                     setReady({ url: made.url, label: made.label })
                  },
                  onError: fail,
               })
            }
         />
         <ConfirmDeleteDialog
            open={removing !== null}
            onOpenChange={(open) => !open && setRemoving(null)}
            title={`Turn off the link for ${removing?.label ?? ''}?`}
            description='It stops working at once. You can make a new one later.'
            confirmLabel='Turn off'
            isPending={remove.isPending}
            onConfirm={() =>
               removing &&
               remove.mutate(removing.id, {
                  onSuccess: () => {
                     setRemoving(null)
                     toast.success('Link turned off')
                  },
                  onError: fail,
               })
            }
         />
      </div>
   )
}
