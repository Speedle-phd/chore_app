import { useId, useState } from 'react'
import { CalendarPlus, Copy, Link2, Link2Off, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useCreateFeed, useFeed, useRemoveFeed, useSetFeedScope, type FeedScope } from './icalApi'

const SCOPES: { value: FeedScope; label: string; hint: string }[] = [
   { value: 'all', label: 'The whole household', hint: 'Every chore, event, birthday and vacation.' },
   { value: 'mine', label: 'Only mine', hint: 'Chores and entries you’re part of, and your birthday.' },
]

const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Settings: a private link calendar apps can subscribe to (made, scoped, replaced or turned off by each member). */
export function FeedSection({ householdId }: { householdId: string }) {
   const id = useId()
   const feed = useFeed(householdId)
   const create = useCreateFeed(householdId)
   const setScope = useSetFeedScope(householdId)
   const remove = useRemoveFeed(householdId)
   // The link exists only in the response that made it; keep it while this page is open.
   const [url, setUrl] = useState<string | null>(null)
   const [newScope, setNewScope] = useState<FeedScope>('all')
   const [replaceOpen, setReplaceOpen] = useState(false)
   const [removeOpen, setRemoveOpen] = useState(false)

   const makeLink = (scope: FeedScope, done?: () => void) =>
      create.mutate(scope, {
         onSuccess: (made) => {
            setUrl(made.url)
            done?.()
         },
         onError: (e) => toast.error(apiError(e).message),
      })

   if (feed.isPending) return <div className='h-24 animate-pulse rounded-xl bg-muted' />
   if (feed.isError) {
      return (
         <div role='alert' className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm'>
            <span>Couldn’t load your calendar link: {apiError(feed.error).message}</span>
            <Button variant='outline' size='sm' onClick={() => void feed.refetch()}>
               <RefreshCw />
               Try again
            </Button>
         </div>
      )
   }

   const scope = feed.data.enabled ? feed.data.scope : newScope
   const scopePicker = (
      <RadioGroup
         value={scope}
         aria-labelledby={`${id}-scope`}
         className='gap-1'
         disabled={setScope.isPending || create.isPending}
         onValueChange={(value) => {
            const next = value as FeedScope
            if (!feed.data.enabled) return setNewScope(next)
            setScope.mutate(next, {
               onSuccess: () => toast.success('Calendar link updated'),
               onError: (e) => toast.error(apiError(e).message),
            })
         }}
      >
         {SCOPES.map((s) => (
            // No hover background: muted hint text on bg-muted falls below 4.5:1.
            <label key={s.value} className='flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2'>
               <RadioGroupItem value={s.value} className='mt-0.5' />
               <span className='text-sm'>
                  <span className='block font-medium'>{s.label}</span>
                  <span className='block text-muted-foreground'>{s.hint}</span>
               </span>
            </label>
         ))}
      </RadioGroup>
   )

   return (
      <div className='space-y-4'>
         <div className='space-y-1.5'>
            <span id={`${id}-scope`} className='text-sm font-medium'>
               What the link shows
            </span>
            {scopePicker}
         </div>

         {url && (
            <div className='space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4'>
               <label htmlFor={`${id}-url`} className='text-sm font-medium'>
                  Your calendar link
               </label>
               <div className='flex flex-col gap-2 sm:flex-row'>
                  <Input id={`${id}-url`} readOnly value={url} className='font-mono text-xs' onFocus={(e) => e.currentTarget.select()} />
                  <Button
                     variant='outline'
                     className='shrink-0'
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
               </div>
               <p className='text-sm text-muted-foreground'>
                  Copy it now: for your privacy it isn’t shown again. Anyone with the link can read the calendar, so keep it to
                  yourself.
               </p>
               <a
                  href={url.replace(/^https?:/, 'webcal:')}
                  className='inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline'
               >
                  <CalendarPlus className='size-4' aria-hidden />
                  Open in your calendar app
               </a>
            </div>
         )}

         {feed.data.enabled ? (
            <div className='space-y-3'>
               <p className='flex items-center gap-2 text-sm'>
                  <Link2 className='size-4 text-muted-foreground' aria-hidden />
                  <span>
                     Link made {feed.data.issuedAt && dateText(feed.data.issuedAt)}
                     <span className='text-muted-foreground'>
                        {' · '}
                        {feed.data.lastUsedAt ? `last fetched ${dateText(feed.data.lastUsedAt)}` : 'not fetched yet'}
                     </span>
                  </span>
               </p>
               <div className='flex flex-wrap gap-2'>
                  <ConfirmDeleteDialog
                     open={replaceOpen}
                     onOpenChange={setReplaceOpen}
                     trigger={
                        <Button variant='outline'>
                           <RefreshCw />
                           Replace link
                        </Button>
                     }
                     title='Replace your calendar link?'
                     description='The current link stops working. Calendar apps that use it need the new one.'
                     confirmLabel='Replace link'
                     isPending={create.isPending}
                     onConfirm={() => makeLink(scope, () => setReplaceOpen(false))}
                  />
                  <ConfirmDeleteDialog
                     open={removeOpen}
                     onOpenChange={setRemoveOpen}
                     trigger={
                        <Button variant='outline'>
                           <Link2Off />
                           Turn off
                        </Button>
                     }
                     title='Turn off your calendar link?'
                     description='Calendar apps that use it stop getting updates.'
                     confirmLabel='Turn off'
                     isPending={remove.isPending}
                     onConfirm={() =>
                        remove.mutate(undefined, {
                           onSuccess: () => {
                              setRemoveOpen(false)
                              setUrl(null)
                              toast.success('Calendar link turned off')
                           },
                           onError: (e) => toast.error(apiError(e).message),
                        })
                     }
                  />
               </div>
            </div>
         ) : (
            <Button onClick={() => makeLink(newScope)} disabled={create.isPending}>
               <Link2 />
               {create.isPending ? 'Making link…' : 'Make a calendar link'}
            </Button>
         )}
      </div>
   )
}
