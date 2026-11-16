import { Archive, ArchiveRestore, CalendarCheck, ChevronRight, Pencil, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { AvatarStack } from '@/features/calendar/AvatarStack'
import { useArchiveChore, type CalendarItem } from '@/features/calendar/calendarApi'
import { describeRepeat } from '@/features/calendar/recurrence'
import type { Member } from '@/features/households/householdsApi'
import { EffortDots } from './ChoreCard'

type ChoreLibraryProps = {
   householdId: string
   /** Chores to show (already filtered by "Only mine"). */
   items: CalendarItem[]
   members: Member[]
   /** Archiving and restoring follow the delete rule: who added it, or admins. */
   canArchive: (createdBy: string) => boolean
   onEdit: (itemId: string) => void
}

/** Chores → All chores: active chores, then the archived ones (collapsed). */
export function ChoreLibrary({ householdId, items, members, canArchive, onEdit }: ChoreLibraryProps) {
   const archive = useArchiveChore(householdId)
   const active = items.filter((i) => !i.archivedAt)
   const archived = items.filter((i) => i.archivedAt)

   const setArchived = (item: CalendarItem, on: boolean) =>
      archive.mutate(
         { id: item.id, archived: on },
         {
            onSuccess: () =>
               on
                  ? toast.success(`“${item.title}” archived`, {
                       description: 'Its history stays in the stats.',
                       action: { label: 'Undo', onClick: () => setArchived(item, false) },
                    })
                  : toast.success(`“${item.title}” restored`, { description: 'It starts again from today.' }),
            onError: (e) => toast.error(apiError(e).message),
         },
      )

   const row = (item: CalendarItem) => {
      const people = item.memberIds.flatMap((id) => members.find((m) => m.id === id) ?? [])
      const allowed = canArchive(item.createdBy)
      return (
         <li key={item.id} className='flex flex-wrap items-center gap-3 p-3'>
            <div className='min-w-0 flex-1'>
               <p className='truncate font-medium'>{item.title}</p>
               <p className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground'>
                  {item.archivedAt ? (
                     <span className='flex items-center gap-1'>
                        <Archive className='size-3.5' aria-hidden />
                        Archived {new Date(item.archivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                     </span>
                  ) : (
                     <span className='flex items-center gap-1'>
                        {item.rrule || item.afterDays ? <Repeat className='size-3.5' aria-hidden /> : <CalendarCheck className='size-3.5' aria-hidden />}
                        {describeRepeat(item.rrule, item.timezone, item.afterDays)}
                     </span>
                  )}
                  <EffortDots effort={item.chore.effort} />
                  <span>
                     {item.chore.assignmentMode === 'everyone' ? 'Each of them' : item.chore.rotation ? 'Taking turns' : 'Any one of them'}
                  </span>
               </p>
            </div>
            <AvatarStack people={people} max={4} />
            <div className='flex gap-1'>
               <Button variant='ghost' size='sm' onClick={() => onEdit(item.id)} aria-label={`Edit “${item.title}”`}>
                  <Pencil />
                  Edit
               </Button>
               {allowed &&
                  (item.archivedAt ? (
                     <Button
                        variant='ghost'
                        size='sm'
                        disabled={archive.isPending}
                        onClick={() => setArchived(item, false)}
                        aria-label={`Restore “${item.title}”`}
                     >
                        <ArchiveRestore />
                        Restore
                     </Button>
                  ) : (
                     <Button
                        variant='ghost'
                        size='sm'
                        disabled={archive.isPending}
                        onClick={() => setArchived(item, true)}
                        aria-label={`Archive “${item.title}”`}
                     >
                        <Archive />
                        Archive
                     </Button>
                  ))}
            </div>
         </li>
      )
   }

   return (
      <div className='space-y-6'>
         {active.length ? (
            <ul className='divide-y rounded-xl border bg-card'>{active.map(row)}</ul>
         ) : (
            <p className='rounded-xl border p-4 text-sm text-muted-foreground'>No active chores. Add one, or restore an archived one.</p>
         )}
         {archived.length > 0 && (
            <details className='group space-y-3'>
               <summary className='flex cursor-pointer list-none items-center gap-2 rounded-lg py-1 text-sm font-medium [&::-webkit-details-marker]:hidden'>
                  <ChevronRight className='size-4 transition-transform group-open:rotate-90' aria-hidden />
                  Archived ({archived.length})
               </summary>
               <p className='text-sm text-muted-foreground'>
                  Archived chores aren’t planned anymore; what was done stays in the stats. Restoring starts them again from today.
               </p>
               <ul className='divide-y rounded-xl border bg-card'>{archived.map(row)}</ul>
            </details>
         )}
      </div>
   )
}
