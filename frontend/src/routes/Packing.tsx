import { useMemo, useState } from 'react'
import { ChevronRight, Luggage, Pencil, Plane, Plus, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AvatarStack } from '@/features/calendar/AvatarStack'
import { useHousehold, useMembers, type Member } from '@/features/households/householdsApi'
import { canDeleteShared } from '@/features/households/permissions'
import { NewListDialog } from '@/features/packing/NewListDialog'
import { useDeleteTemplate, usePackingLists, useTemplates, type PackingListSummary, type PackingTemplate } from '@/features/packing/packingApi'
import { ProgressBar } from '@/features/packing/ProgressBar'
import { TemplateDialog } from '@/features/packing/TemplateDialog'
import { usePageMeta } from './usePageMeta'

/** /packing — packing lists (active and archived) and templates (?tab=templates). */
const Packing = () => {
   const meta = usePageMeta('/packing')
   const household = useHousehold()
   const members = useMembers(household.id)
   const memberList = useMemo(() => members.data ?? [], [members.data])
   const [params, setParams] = useSearchParams()
   const tab = params.get('tab') === 'templates' ? 'templates' : 'lists'
   const [creating, setCreating] = useState(false)

   return (
      <>
         <PageHeader
            title={meta?.label ?? 'Packing'}
            description={meta?.subtitle}
            Icon={meta?.Icon}
            action={
               <Button onClick={() => setCreating(true)}>
                  <Plus />
                  New packing list
               </Button>
            }
         />
         <Tabs value={tab} onValueChange={(v) => setParams(v === 'templates' ? { tab: 'templates' } : {}, { replace: true })}>
            <TabsList className='mb-5'>
               <TabsTrigger value='lists'>Lists</TabsTrigger>
               <TabsTrigger value='templates'>Templates</TabsTrigger>
            </TabsList>
            <TabsContent value='lists'>
               <Lists householdId={household.id} members={memberList} onCreate={() => setCreating(true)} />
            </TabsContent>
            <TabsContent value='templates'>
               <Templates householdId={household.id} canDelete={(t) => canDeleteShared(household.role, t.createdBy === memberList.find((m) => m.isMe)?.id)} />
            </TabsContent>
         </Tabs>
         {creating && <NewListDialog householdId={household.id} members={memberList} onClose={() => setCreating(false)} />}
      </>
   )
}

function LoadError({ error, retry, what }: { error: unknown; retry: () => void; what: string }) {
   return (
      <EmptyState Icon={WifiOff} title={`Couldn’t load the ${what}`} description={apiError(error).message}>
         <Button variant='outline' onClick={retry}>
            <RefreshCw />
            Try again
         </Button>
      </EmptyState>
   )
}

const GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'

function Lists({ householdId, members, onCreate }: { householdId: string; members: Member[]; onCreate: () => void }) {
   const lists = usePackingLists(householdId)
   if (lists.isPending) return <div className='h-32 animate-pulse rounded-2xl bg-muted' aria-busy='true' aria-label='Loading packing lists' />
   if (lists.isError) return <LoadError error={lists.error} retry={() => void lists.refetch()} what='packing lists' />
   const active = lists.data.filter((l) => !l.archivedAt)
   const archived = lists.data.filter((l) => l.archivedAt)
   return (
      <div className='space-y-6'>
         {active.length === 0 ? (
            <EmptyState Icon={Luggage} title='No packing lists yet' description='Start one from a template, or from a vacation in the calendar.'>
               <Button onClick={onCreate}>
                  <Plus />
                  New packing list
               </Button>
            </EmptyState>
         ) : (
            <ul className={GRID}>
               {active.map((l) => (
                  <ListCard key={l.id} list={l} members={members} />
               ))}
            </ul>
         )}
         {archived.length > 0 && (
            <details className='group rounded-2xl border p-3'>
               <summary className='flex cursor-pointer list-none items-center gap-2 px-2 text-sm font-semibold [&::-webkit-details-marker]:hidden'>
                  <ChevronRight className='size-4 transition-transform group-open:rotate-90' aria-hidden />
                  Archived ({archived.length})
               </summary>
               <ul className={`mt-3 ${GRID}`}>
                  {archived.map((l) => (
                     <ListCard key={l.id} list={l} members={members} />
                  ))}
               </ul>
            </details>
         )}
      </div>
   )
}

function ListCard({ list, members }: { list: PackingListSummary; members: Member[] }) {
   const travellers = list.travellerIds.flatMap((id) => members.find((m) => m.id === id) ?? [])
   const { done, total } = list.progress
   return (
      <li className='relative flex flex-col gap-3 rounded-2xl border bg-card p-4 focus-within:ring-3 focus-within:ring-ring/50 hover:border-foreground/25'>
         <div className='flex items-start justify-between gap-2'>
            <h2 className='min-w-0 font-semibold'>
               {/* The whole card is the link (stretched), so it's one tab stop. */}
               <Link to={`/packing/${list.id}`} className='outline-none after:absolute after:inset-0 after:rounded-2xl'>
                  <span className='block truncate'>{list.name}</span>
               </Link>
            </h2>
            <AvatarStack people={travellers} size='sm' />
         </div>
         <ProgressBar done={done} total={total} />
         {list.vacationId && (
            <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
               <Plane className='size-3.5' aria-hidden />
               For a vacation in the calendar
            </p>
         )}
      </li>
   )
}

function Templates({ householdId, canDelete }: { householdId: string; canDelete: (t: PackingTemplate) => boolean }) {
   const templates = useTemplates(householdId)
   const remove = useDeleteTemplate(householdId)
   const [editing, setEditing] = useState<PackingTemplate | 'new' | null>(null)
   const [deleting, setDeleting] = useState<PackingTemplate | null>(null)
   if (templates.isPending) return <div className='h-32 animate-pulse rounded-2xl bg-muted' aria-busy='true' aria-label='Loading templates' />
   if (templates.isError) return <LoadError error={templates.error} retry={() => void templates.refetch()} what='templates' />
   return (
      <div className='space-y-4'>
         <p className='text-sm'>Templates are starting points; a new list copies its items, so editing a template doesn’t change existing lists.</p>
         <Button variant='outline' onClick={() => setEditing('new')}>
            <Plus />
            New template
         </Button>
         {templates.data.length === 0 ? (
            <EmptyState Icon={Luggage} title='No templates' description='Make one here, or save a packing list as a template.' />
         ) : (
            <ul className={GRID}>
               {templates.data.map((t) => (
                  <li key={t.id} className='flex items-center gap-2 rounded-2xl border bg-card p-4'>
                     <div className='min-w-0 flex-1'>
                        <h2 className='truncate font-semibold'>{t.name}</h2>
                        <p className='text-sm text-muted-foreground'>
                           {t.items.length} {t.items.length === 1 ? 'item' : 'items'}, {t.items.filter((i) => i.perPerson).length} for each person
                        </p>
                     </div>
                     <Button variant='ghost' size='icon' aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                        <Pencil />
                     </Button>
                     {canDelete(t) && (
                        <Button variant='ghost' size='icon' aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                           <Trash2 className='text-destructive' />
                        </Button>
                     )}
                  </li>
               ))}
            </ul>
         )}
         {editing && <TemplateDialog householdId={householdId} template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
         <ConfirmDeleteDialog
            open={deleting !== null}
            onOpenChange={(open) => !open && setDeleting(null)}
            title={`Delete “${deleting?.name ?? ''}”?`}
            description='Lists already made from it keep their items.'
            isPending={remove.isPending}
            onConfirm={() =>
               deleting &&
               remove.mutate(deleting.id, {
                  onSuccess: () => {
                     toast.success(`Deleted ${deleting.name}`)
                     setDeleting(null)
                  },
                  onError: (e) => toast.error(apiError(e).message),
               })
            }
         />
      </div>
   )
}

export default Packing
