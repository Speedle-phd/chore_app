import { useId, useState } from 'react'
import { Copy, ExternalLink, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiError, type ApiError } from '@/api/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import { endOfDay, localDate, readableProblem } from './guestText'
import { QrCode } from './QrCode'
import { GUEST_SECTIONS, SECTION_LABEL, type GuestLink, type GuestSection, type LinkInput } from './types'

/** New link or change an existing one: label, sections, optional last day. */
export function LinkDialog({
   open,
   onOpenChange,
   link,
   filled,
   isPending,
   onSubmit,
}: {
   open: boolean
   onOpenChange: (open: boolean) => void
   /** The link being changed, or undefined for a new one. */
   link?: GuestLink | undefined
   /** Sections with content (the others are marked "empty"). */
   filled: Set<GuestSection>
   isPending: boolean
   onSubmit: (input: LinkInput, onError: (e: unknown) => void) => void
}) {
   const id = useId()
   const [label, setLabel] = useState(link?.label ?? '')
   const [sections, setSections] = useState<GuestSection[]>(link?.sections ?? GUEST_SECTIONS.filter((s) => filled.has(s)))
   const [until, setUntil] = useState(link?.expiresAt ? localDate(link.expiresAt) : '')
   const [error, setError] = useState<ApiError | null>(null)

   const toggle = (s: GuestSection, on: boolean) => setSections((cur) => (on ? GUEST_SECTIONS.filter((x) => x === s || cur.includes(x)) : cur.filter((x) => x !== s)))
   const submit = () => {
      setError(null)
      onSubmit({ label: label.trim(), sections, expiresAt: until ? endOfDay(until) : null }, (e) => {
         const problem = apiError(e)
         setError({ ...problem, ...(problem.details ? { details: problem.details.map(readableProblem) } : {}) })
      })
   }

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className='sm:max-w-md'>
            <form
               onSubmit={(e) => {
                  e.preventDefault()
                  submit()
               }}
               className='space-y-5'
            >
               <DialogHeader>
                  <DialogTitle>{link ? 'Change guest link' : 'New guest link'}</DialogTitle>
                  <DialogDescription>Anyone with the link can open the page without signing in, until you turn it off.</DialogDescription>
               </DialogHeader>
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-label`} className='text-sm font-medium'>
                     Who it’s for
                  </label>
                  <Input id={`${id}-label`} aria-describedby={`${id}-label-hint`} maxLength={60} required value={label} onChange={(e) => setLabel(e.target.value)} placeholder='Lena, babysitter' />
                  <p id={`${id}-label-hint`} className='text-xs text-muted-foreground'>
                     Only you see this, to tell the links apart.
                  </p>
               </div>
               <fieldset className='space-y-2'>
                  <legend className='mb-1.5 text-sm font-medium'>What it shows</legend>
                  {GUEST_SECTIONS.map((s) => (
                     <label key={s} className='flex items-center gap-2.5 text-sm'>
                        <Checkbox checked={sections.includes(s)} onCheckedChange={(on) => toggle(s, on)} />
                        {SECTION_LABEL[s]}
                        {!filled.has(s) && <span className='text-muted-foreground'>(empty, not shown yet)</span>}
                     </label>
                  ))}
               </fieldset>
               <div className='space-y-1.5'>
                  <span id={`${id}-until`} className='text-sm font-medium'>
                     Works until
                  </span>
                  <div className='flex flex-wrap items-center gap-2'>
                     <DatePicker aria-label='Last day the link works' value={until} onChange={setUntil} />
                     {until ? (
                        <Button type='button' variant='ghost' size='sm' onClick={() => setUntil('')}>
                           No end
                        </Button>
                     ) : (
                        <span className='text-sm text-muted-foreground'>No end: works until you turn it off</span>
                     )}
                  </div>
               </div>
               {error && <FormAlert tone='error' error={error} />}
               <DialogFooter>
                  <Button type='button' variant='ghost' onClick={() => onOpenChange(false)}>
                     Cancel
                  </Button>
                  <Button type='submit' disabled={isPending || !label.trim() || sections.length === 0}>
                     {isPending ? 'Saving…' : link ? 'Save' : 'Make link'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   )
}

/** Shown once after making or replacing a link: the server only keeps a hash of it. */
export function LinkReadyDialog({ url, label, onClose }: { url: string | null; label: string; onClose: () => void }) {
   const id = useId()
   const canShare = typeof navigator.share === 'function'
   return (
      <Dialog open={url !== null} onOpenChange={(open) => !open && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>Link for {label} is ready</DialogTitle>
               <DialogDescription>Copy or share it now: for privacy it isn’t shown again. If it gets lost, replace it.</DialogDescription>
            </DialogHeader>
            {url && (
               <div className='space-y-4'>
                  <div className='space-y-1.5'>
                     <label htmlFor={`${id}-url`} className='text-sm font-medium'>
                        Guest link
                     </label>
                     <Input id={`${id}-url`} readOnly value={url} className='font-mono text-xs' onFocus={(e) => e.currentTarget.select()} />
                  </div>
                  <div className='flex flex-wrap gap-2'>
                     <Button
                        onClick={() =>
                           void navigator.clipboard.writeText(url).then(
                              () => toast.success('Link copied'),
                              () => toast.error('Couldn’t copy; select the link and copy it yourself.'),
                           )
                        }
                     >
                        <Copy />
                        Copy
                     </Button>
                     {canShare && (
                        <Button variant='outline' onClick={() => void navigator.share({ title: 'Guest page', url }).catch(() => undefined)}>
                           <Share2 />
                           Share
                        </Button>
                     )}
                     <a href={url} target='_blank' rel='noopener noreferrer' className={buttonVariants({ variant: 'outline' })}>
                        <ExternalLink />
                        Open
                     </a>
                  </div>
                  <figure className='flex flex-col items-center gap-2'>
                     <QrCode text={url} label={`QR code of the guest link for ${label}`} className='w-44 border' />
                     <figcaption className='text-center text-xs text-muted-foreground'>Or let them scan it from your screen.</figcaption>
                  </figure>
               </div>
            )}
            <DialogFooter>
               <Button variant='outline' onClick={onClose}>
                  Done
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
