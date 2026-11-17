import { useId, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ArrowLeft, BookmarkPlus, Ellipsis, Luggage, Pencil, Plus, RefreshCw, ShoppingCart, Trash2, UserPlus, Users, WifiOff, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { selectClass } from '@/features/calendar/styles'
import { useHousehold, useMembers, type Member } from '@/features/households/householdsApi'
import { canDeleteShared } from '@/features/households/permissions'
import { parseAmount } from '@/features/packing/amounts'
import { ItemDialog } from '@/features/packing/ItemDialog'
import { TravellersDialog } from '@/features/packing/TravellersDialog'
import { NameDialog, ToShoppingDialog } from '@/features/packing/ListDialogs'
import {
   isNotFound,
   useAddPackingItem,
   useDeleteList,
   usePackingList,
   useRemovePackingItem,
   useSaveAsTemplate,
   useToShopping,
   useUpdateList,
   useUpdatePackingItem,
   type PackingItem,
   type PackingList,
} from '@/features/packing/packingApi'
import { ProgressBar } from '@/features/packing/ProgressBar'
import { bySection, SECTION_IDS, SECTIONS, type PackingSection } from '@/features/packing/sections'
import { cn } from '@/lib/utils'

/** Filter: everything, only shared items, or one person's. */
type Who = 'all' | 'shared' | string

const pressedClass = cn(
   'h-8 gap-1.5 px-3 text-sm font-normal text-muted-foreground',
   'data-pressed:border-foreground/30 data-pressed:bg-card data-pressed:font-medium data-pressed:text-foreground',
)

const PackingListPage = () => {
   const { listId = '' } = useParams()
   const household = useHousehold()
   const members = useMembers(household.id)
   const list = usePackingList(household.id, listId)

   if (list.isPending) return <div className='h-64 animate-pulse rounded-2xl bg-muted' aria-busy='true' aria-label='Loading the packing list' />
   if (list.isError) {
      const missing = isNotFound(list.error)
      return (
         <div className='space-y-4'>
            <BackLink />
            <EmptyState
               Icon={missing ? Luggage : WifiOff}
               title={missing ? 'Packing list not found' : 'Couldn’t load the packing list'}
               description={missing ? 'It may have been deleted.' : apiError(list.error).message}
            >
               {!missing && (
                  <Button variant='outline' onClick={() => void list.refetch()}>
                     <RefreshCw />
                     Try again
                  </Button>
               )}
            </EmptyState>
         </div>
      )
   }
   return <ListView householdId={household.id} role={household.role} list={list.data} members={members.data ?? []} />
}

function BackLink() {
   return (
      <Link to='/packing' className='inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground'>
         <ArrowLeft className='size-4' aria-hidden />
         All packing lists
      </Link>
   )
}

function ListView({ householdId, role, list, members }: { householdId: string; role: Member['role']; list: PackingList; members: Member[] }) {
   const navigate = useNavigate()
   const me = members.find((m) => m.isMe)
   const nameOf = (id: string) => members.find((m) => m.id === id)?.fname ?? 'Someone who left'
   // Travellers first, then anyone else who has items.
   const people = useMemo(
      () => [...new Set([...list.travellerIds, ...list.items.flatMap((i) => (i.memberId ? [i.memberId] : []))])],
      [list.travellerIds, list.items],
   )
   const [who, setWho] = useState<Who>('all')
   const filter = who !== 'all' && who !== 'shared' && !people.includes(who) ? 'all' : who
   const shown = list.items.filter((i) => (filter === 'all' ? true : filter === 'shared' ? i.memberId === null : i.memberId === filter))
   const count = (items: PackingItem[]) => `${items.filter((i) => i.checked).length}/${items.length}`

   const update = useUpdateList(householdId, list.id)
   const remove = useDeleteList(householdId)
   const toShopping = useToShopping(householdId, list.id)
   const saveTemplate = useSaveAsTemplate(householdId, list.id)
   const [dialog, setDialog] = useState<'rename' | 'template' | 'shopping' | 'delete' | 'travellers' | null>(null)
   const [editing, setEditing] = useState<PackingItem | null>(null)
   const choosable = list.travellerIds.length ? people : members.map((m) => m.id)
   const unpacked = list.items.filter((i) => !i.checked).length
   const archived = list.archivedAt !== null

   const setArchived = (on: boolean) =>
      update.mutate({ archived: on }, { onSuccess: () => toast.success(on ? 'Archived' : 'Restored'), onError: (e) => toast.error(apiError(e).message) })

   return (
      <>
         <div className='mb-4'>
            <BackLink />
         </div>
         <PageHeader
            title={list.name}
            description={list.days ? `${list.days}-day trip` : undefined}
            Icon={Luggage}
            action={
               <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant='outline' aria-label={`More for “${list.name}”`} />}>
                     <Ellipsis />
                     More
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='min-w-56'>
                     <DropdownMenuItem onClick={() => setDialog('travellers')}>
                        <Users />
                        Who’s going
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => setDialog('rename')}>
                        <Pencil />
                        Rename
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => setDialog('shopping')} disabled={unpacked === 0}>
                        <ShoppingCart />
                        Add unpacked to shopping list
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => setDialog('template')} disabled={list.items.length === 0}>
                        <BookmarkPlus />
                        Save as template
                     </DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem onClick={() => setArchived(!archived)}>
                        {archived ? <ArchiveRestore /> : <Archive />}
                        {archived ? 'Restore' : 'Archive'}
                     </DropdownMenuItem>
                     {canDeleteShared(role, list.createdBy === me?.id) && (
                        <DropdownMenuItem onClick={() => setDialog('delete')}>
                           <Trash2 className='text-destructive' />
                           Delete
                        </DropdownMenuItem>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>
            }
         />

         <div className='space-y-6'>
            {archived && (
               <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/50 px-4 py-3 text-sm'>
                  <span>This list is archived.</span>
                  <Button variant='outline' size='sm' onClick={() => setArchived(false)} disabled={update.isPending}>
                     <ArchiveRestore />
                     Restore
                  </Button>
               </div>
            )}
            <div className='max-w-md'>
               <ProgressBar done={list.progress.done} total={list.progress.total} />
            </div>

            <div className='flex flex-wrap items-center gap-2'>
               {people.length > 0 && (
                  <ToggleGroup
                     aria-label='Show items of'
                     variant='outline'
                     spacing={1}
                     className='flex-wrap'
                     value={[filter]}
                     onValueChange={(next) => next[0] && setWho(next[0])}
                  >
                     <ToggleGroupItem value='all' className={pressedClass}>
                        Everything <span className='tabular-nums'>{count(list.items)}</span>
                     </ToggleGroupItem>
                     <ToggleGroupItem value='shared' className={pressedClass}>
                        Shared <span className='tabular-nums'>{count(list.items.filter((i) => i.memberId === null))}</span>
                     </ToggleGroupItem>
                     {people.map((id) => (
                        <ToggleGroupItem key={id} value={id} className={pressedClass}>
                           {nameOf(id)} <span className='tabular-nums'>{count(list.items.filter((i) => i.memberId === id))}</span>
                        </ToggleGroupItem>
                     ))}
                  </ToggleGroup>
               )}
               <Button variant='ghost' size='sm' onClick={() => setDialog('travellers')}>
                  <UserPlus />
                  {list.travellerIds.length ? 'Change travellers' : 'Add travellers'}
               </Button>
            </div>

            <AddItemForm
               householdId={householdId}
               listId={list.id}
               people={choosable}
               nameOf={nameOf}
               defaultMember={filter !== 'all' && filter !== 'shared' ? filter : null}
            />

            {shown.length === 0 ? (
               <EmptyState
                  Icon={Luggage}
                  title={list.items.length ? 'Nothing here' : 'Nothing on this list yet'}
                  description={list.items.length ? 'No items for this choice.' : 'Add what to pack above; everyone at home sees it right away.'}
               />
            ) : (
               bySection(shown).map(({ section, items }) => {
                  const { Icon, label } = SECTIONS[section]
                  return (
                     <section key={section} aria-label={label}>
                        <h2 className='mb-2 flex items-center gap-2 text-sm font-semibold'>
                           <Icon className='size-4 text-muted-foreground' aria-hidden />
                           {label}
                           <span className='font-normal text-muted-foreground'>({count(items)})</span>
                        </h2>
                        <ul className='divide-y rounded-2xl border bg-card'>
                           {items.map((item) => (
                              <ItemRow
                                 key={item.id}
                                 householdId={householdId}
                                 listId={list.id}
                                 item={item}
                                 owner={item.memberId && filter === 'all' ? nameOf(item.memberId) : null}
                                 onEdit={() => setEditing(item)}
                              />
                           ))}
                        </ul>
                     </section>
                  )
               })
            )}
         </div>

         {dialog === 'travellers' && (
            <TravellersDialog householdId={householdId} list={list} members={members} nameOf={nameOf} onClose={() => setDialog(null)} />
         )}
         {editing && (
            <ItemDialog householdId={householdId} listId={list.id} item={editing} people={choosable} nameOf={nameOf} onClose={() => setEditing(null)} />
         )}
         {dialog === 'rename' && (
            <NameDialog
               title='Rename packing list'
               description={list.name}
               initial={list.name}
               submitLabel='Save'
               isPending={update.isPending}
               error={update.error}
               onSubmit={(name) => update.mutate({ name }, { onSuccess: () => setDialog(null) })}
               onClose={() => setDialog(null)}
            />
         )}
         {dialog === 'template' && (
            <NameDialog
               title='Save as template'
               description='Each item once; things anyone had for themselves become “each person”.'
               initial={list.name}
               submitLabel='Save template'
               isPending={saveTemplate.isPending}
               error={saveTemplate.error}
               onSubmit={(name) =>
                  saveTemplate.mutate(name, {
                     onSuccess: (t) => {
                        setDialog(null)
                        toast.success(`Saved template ${t.name}`, { action: { label: 'Show', onClick: () => void navigate('/packing?tab=templates') } })
                     },
                  })
               }
               onClose={() => setDialog(null)}
            />
         )}
         {dialog === 'shopping' && (
            <ToShoppingDialog
               householdId={householdId}
               count={unpacked}
               isPending={toShopping.isPending}
               error={toShopping.error}
               onSubmit={(shoppingListId) =>
                  toShopping.mutate(shoppingListId, {
                     onSuccess: ({ added }) => {
                        setDialog(null)
                        toast.success(`Added ${added} ${added === 1 ? 'thing' : 'things'} to the shopping list`, {
                           action: { label: 'Open', onClick: () => void navigate(`/shopping-list?list=${shoppingListId}`) },
                        })
                     },
                  })
               }
               onClose={() => setDialog(null)}
            />
         )}
         <ConfirmDeleteDialog
            open={dialog === 'delete'}
            onOpenChange={(open) => !open && setDialog(null)}
            title={`Delete “${list.name}”?`}
            description='The list and its items are gone for everyone. Archive it instead to keep it.'
            isPending={remove.isPending}
            onConfirm={() =>
               remove.mutate(list.id, {
                  onSuccess: () => {
                     toast.success(`Deleted ${list.name}`)
                     void navigate('/packing', { replace: true })
                  },
                  onError: (e) => toast.error(apiError(e).message),
               })
            }
         />
      </>
   )
}

function ItemRow({
   householdId,
   listId,
   item,
   owner,
   onEdit,
}: {
   householdId: string
   listId: string
   item: PackingItem
   owner: string | null
   onEdit: () => void
}) {
   const update = useUpdatePackingItem(householdId, listId)
   const remove = useRemovePackingItem(householdId, listId)
   const what = item.quantity ? `${item.quantity} × ${item.text}` : item.text
   const name = owner ? `${what} (${owner})` : what
   return (
      <li className='flex items-center gap-3 px-3 py-1.5'>
         <label className='flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5'>
            <Checkbox
               checked={item.checked}
               onCheckedChange={(checked) => update.mutate({ id: item.id, change: { checked } }, { onError: (e) => toast.error(apiError(e).message) })}
            />
            <span className={cn('min-w-0 flex-1 wrap-break-word', item.checked && 'text-muted-foreground line-through')}>
               {item.quantity !== null && <span className='me-1.5 font-semibold tabular-nums'>{item.quantity} ×</span>}
               {item.text}
            </span>
            {owner && <span className='shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'>{owner}</span>}
         </label>
         <Button variant='ghost' size='icon-sm' aria-label={`Edit ${name}`} onClick={onEdit}>
            <Pencil />
         </Button>
         <Button
            variant='ghost'
            size='icon-sm'
            aria-label={`Remove ${name}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate(item.id, { onError: (e) => toast.error(apiError(e).message) })}
         >
            <X />
         </Button>
      </li>
   )
}

function AddItemForm({
   householdId,
   listId,
   people,
   nameOf,
   defaultMember,
}: {
   householdId: string
   listId: string
   people: string[]
   nameOf: (id: string) => string
   defaultMember: string | null
}) {
   const id = useId()
   const add = useAddPackingItem(householdId, listId)
   const [text, setText] = useState('')
   const [amount, setAmount] = useState('')
   const quantity = parseAmount(amount)
   const [section, setSection] = useState<PackingSection>('clothes')
   const [picked, setPicked] = useState<string | null | undefined>(undefined)
   // Follows the person filter until someone picks explicitly.
   const memberId = picked === undefined ? defaultMember : picked

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!text.trim() || quantity === undefined) return
      add.mutate(
         { text: text.trim(), section, memberId, quantity },
         {
            onSuccess: () => {
               setText('')
               setAmount('')
            },
            onError: (error) => toast.error(apiError(error).message),
         },
      )
   }
   return (
      <form onSubmit={submit} className='flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3' aria-label='Add an item'>
         <div className='min-w-48 flex-1 basis-full space-y-1 sm:basis-0'>
            <label htmlFor={`${id}-text`} className='block text-xs font-medium text-muted-foreground'>
               Item
            </label>
            <Input id={`${id}-text`} className='h-9' value={text} onChange={(e) => setText(e.target.value)} maxLength={100} placeholder='e.g. Swimsuit' />
         </div>
         <div className='w-16 space-y-1'>
            <label htmlFor={`${id}-amount`} className='block text-xs font-medium text-muted-foreground'>
               Amount
            </label>
            <Input
               id={`${id}-amount`}
               inputMode='numeric'
               value={amount}
               onChange={(e) => setAmount(e.target.value)}
               placeholder='–'
               className='h-9 text-center'
               aria-invalid={quantity === undefined || undefined}
               title='Optional, 1 to 99'
            />
         </div>
         <div className='space-y-1'>
            <label htmlFor={`${id}-section`} className='block text-xs font-medium text-muted-foreground'>
               Section
            </label>
            <select id={`${id}-section`} className={cn(selectClass, 'w-auto')} value={section} onChange={(e) => setSection(e.target.value as PackingSection)}>
               {SECTION_IDS.map((s) => (
                  <option key={s} value={s}>
                     {SECTIONS[s].label}
                  </option>
               ))}
            </select>
         </div>
         <div className='space-y-1'>
            <label htmlFor={`${id}-who`} className='block text-xs font-medium text-muted-foreground'>
               For
            </label>
            <select id={`${id}-who`} className={cn(selectClass, 'w-auto min-w-28')} value={memberId ?? ''} onChange={(e) => setPicked(e.target.value || null)}>
               <option value=''>Shared</option>
               {people.map((p) => (
                  <option key={p} value={p}>
                     {nameOf(p)}
                  </option>
               ))}
            </select>
         </div>
         <Button type='submit' className='ms-auto h-9 sm:ms-0' disabled={!text.trim() || quantity === undefined || add.isPending}>
            <Plus />
            Add
         </Button>
      </form>
   )
}

export default PackingListPage
