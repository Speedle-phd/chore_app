import { useId, useState } from 'react'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import FormAlert from '@/features/auth/FormAlert'
import { MemberPicker } from '@/features/calendar/MemberPicker'
import type { Member } from '@/features/households/householdsApi'
import { useUpdateList, type PackingList } from './packingApi'

/**
 * Change who's going after the list was made: new travellers can get their own
 * copy of the personal items; removed ones take their items with them.
 */
export function TravellersDialog({
   householdId,
   list,
   members,
   nameOf,
   onClose,
}: {
   householdId: string
   list: PackingList
   members: Member[]
   nameOf: (id: string) => string
   onClose: () => void
}) {
   const id = useId()
   const update = useUpdateList(householdId, list.id)
   const [travellerIds, setTravellerIds] = useState(list.travellerIds)
   const [copyItems, setCopyItems] = useState(true)
   const added = travellerIds.filter((t) => !list.travellerIds.includes(t))
   const removed = list.travellerIds.filter((t) => !travellerIds.includes(t))
   // Kinds of personal items (each text once per section), what a newcomer would get.
   const personal = new Set(list.items.filter((i) => i.memberId && !removed.includes(i.memberId)).map((i) => `${i.section}|${i.text.trim().toLowerCase()}`)).size
   const lost = list.items.filter((i) => i.memberId && removed.includes(i.memberId))
   const unchanged = added.length === 0 && removed.length === 0 && travellerIds.join() === list.travellerIds.join()

   const save = () => update.mutate({ travellerIds, copyItems }, { onSuccess: onClose })

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>Who’s going</DialogTitle>
               <DialogDescription>{list.name}</DialogDescription>
            </DialogHeader>
            {update.isError && <FormAlert tone='error' error={apiError(update.error)} />}
            <div className='space-y-1.5'>
               <span id={`${id}-people`} className='block text-sm font-medium'>
                  Travellers
               </span>
               <MemberPicker labelId={`${id}-people`} members={members} value={travellerIds} onChange={setTravellerIds} />
            </div>
            {added.length > 0 && (
               <label className='flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm'>
                  <Checkbox className='mt-0.5' checked={copyItems} onCheckedChange={setCopyItems} disabled={personal === 0} />
                  <span>
                     <span className='block font-medium'>Give {added.map(nameOf).join(' and ')} the personal items</span>
                     <span className='block text-muted-foreground'>
                        {personal
                           ? `${personal} ${personal === 1 ? 'item' : 'items'} that others have for themselves (socks, toothbrush, …), with the same amounts.`
                           : 'Nobody has personal items on this list yet.'}
                     </span>
                  </span>
               </label>
            )}
            {removed.length > 0 && (
               <p role='status' className='rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm'>
                  {lost.length
                     ? `${removed.map(nameOf).join(' and ')}’s ${lost.length} ${lost.length === 1 ? 'item is' : 'items are'} removed from the list.`
                     : `${removed.map(nameOf).join(' and ')} ${removed.length === 1 ? 'has' : 'have'} no items on the list.`}
               </p>
            )}
            <DialogFooter>
               <Button type='button' variant='ghost' onClick={onClose}>
                  Cancel
               </Button>
               <Button onClick={save} disabled={unchanged || update.isPending}>
                  {update.isPending ? 'Saving…' : 'Save'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
