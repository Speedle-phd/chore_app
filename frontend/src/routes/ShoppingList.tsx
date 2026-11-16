import { useMemo, useState } from 'react'
import { ChevronRight, RefreshCw, ShoppingBasket, Tags, Trash2, WifiOff } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { canDeleteShared } from '@/features/households/permissions'
import { AddItemBar } from '@/features/shopping/AddItemBar'
import { CategoriesDialog } from '@/features/shopping/CategoriesDialog'
import { categoryIcon } from '@/features/shopping/categoryIcons'
import { ItemDialog } from '@/features/shopping/ItemDialog'
import { ItemCard } from '@/features/shopping/ItemCard'
import { ListSwitcher } from '@/features/shopping/ListSwitcher'
import {
   useAddItems,
   useCategories,
   useClearBasket,
   useListItems,
   useShoppingLists,
   type ShoppingItem,
} from '@/features/shopping/shoppingApi'
import { groupByCategory } from '@/features/shopping/units'
import { usePageMeta } from './usePageMeta'

const ShoppingList = () => {
   const meta = usePageMeta('/shopping-list')
   const household = useHousehold()
   const members = useMembers(household.id)
   const me = useMemo(() => (members.data ?? []).find((m) => m.isMe), [members.data])
   const lists = useShoppingLists(household.id)
   const categories = useCategories(household.id)
   // The open list is in the URL (?list=…), so it can be linked and survives a reload.
   const [params, setParams] = useSearchParams()
   const current = lists.data?.find((l) => l.id === params.get('list')) ?? lists.data?.[0] ?? null
   const items = useListItems(household.id, current?.id ?? null)
   const [editing, setEditing] = useState<ShoppingItem | null>(null)
   const [managing, setManaging] = useState(false)

   const header = (
      <PageHeader
         title={meta?.label ?? 'Shopping list'}
         description={meta?.subtitle}
         Icon={meta?.Icon}
         action={
            <Button variant='outline' onClick={() => setManaging(true)} disabled={!categories.data}>
               <Tags />
               Categories
            </Button>
         }
      />
   )

   if (lists.isPending || categories.isPending) {
      return (
         <>
            {header}
            <div className='space-y-3' aria-busy='true' aria-label='Loading the shopping list'>
               <div className='h-9 w-64 animate-pulse rounded-lg bg-muted' />
               <div className='h-16 animate-pulse rounded-2xl bg-muted' />
               <div className='h-40 animate-pulse rounded-2xl bg-muted' />
            </div>
         </>
      )
   }
   if (lists.isError || categories.isError || !current) {
      return (
         <>
            {header}
            <EmptyState Icon={WifiOff} title='Couldn’t load the shopping list' description={apiError(lists.error ?? categories.error).message}>
               <Button
                  variant='outline'
                  onClick={() => {
                     void lists.refetch()
                     void categories.refetch()
                  }}
               >
                  <RefreshCw />
                  Try again
               </Button>
            </EmptyState>
         </>
      )
   }

   const select = (id: string) => setParams({ list: id }, { replace: true })
   return (
      <>
         {header}
         <div className='space-y-6'>
            <ListSwitcher
               householdId={household.id}
               lists={lists.data}
               current={current}
               onSelect={select}
               canDelete={(l) => canDeleteShared(household.role, l.createdBy === me?.id)}
            />
            <AddItemBar householdId={household.id} listId={current.id} categories={categories.data} />
            <ListBody householdId={household.id} items={items} categories={categories.data} onEdit={setEditing} listId={current.id} />
         </div>
         {editing && <ItemDialog householdId={household.id} item={editing} categories={categories.data} onClose={() => setEditing(null)} />}
         {managing && <CategoriesDialog householdId={household.id} categories={categories.data} onClose={() => setManaging(false)} />}
      </>
   )
}

/** Cards fill the row: as many columns as fit, at least ~8 rem each. */
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2'

function ListBody({
   householdId,
   listId,
   items,
   categories,
   onEdit,
}: {
   householdId: string
   listId: string
   items: ReturnType<typeof useListItems>
   categories: NonNullable<ReturnType<typeof useCategories>['data']>
   onEdit: (item: ShoppingItem) => void
}) {
   const clear = useClearBasket(householdId, listId)
   const restore = useAddItems(householdId, listId)
   if (items.isPending) return <div className='h-40 animate-pulse rounded-2xl bg-muted' aria-busy='true' aria-label='Loading items' />
   if (items.isError) {
      return (
         <EmptyState Icon={WifiOff} title='Couldn’t load the items' description={apiError(items.error).message}>
            <Button variant='outline' onClick={() => void items.refetch()}>
               <RefreshCw />
               Try again
            </Button>
         </EmptyState>
      )
   }
   const sections = groupByCategory(items.data, categories)
   const basket = items.data.filter((i) => i.checked).sort((a, b) => (b.checkedAt ?? '').localeCompare(a.checkedAt ?? ''))

   const clearBasket = () =>
      clear.mutate(undefined, {
         onSuccess: (removed) =>
            toast.success(`Cleared ${removed.length} ${removed.length === 1 ? 'item' : 'items'}`, {
               action: {
                  label: 'Undo',
                  onClick: () =>
                     restore.mutate(
                        removed.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: i.note, categoryId: i.categoryId, checked: true })),
                     ),
               },
            }),
         onError: (e) => toast.error(apiError(e).message),
      })

   return (
      <div className='space-y-6'>
         {sections.length > 0 && <p className='text-sm'>Tap an item when it’s in your basket; tap it again to put it back.</p>}
         {sections.length === 0 ? (
            <EmptyState
               Icon={ShoppingBasket}
               title={basket.length ? 'All done' : 'Nothing on this list yet'}
               description={basket.length ? 'Everything is in the basket.' : 'Add what you need above; everyone at home sees it right away.'}
            />
         ) : (
            sections.map(({ category, items: sectionItems }) => {
               const Icon = categoryIcon(category?.icon)
               const title = category?.name ?? 'Other things'
               return (
                  <section key={category?.id ?? 'none'} aria-label={title}>
                     <h2 className='mb-2 flex items-center gap-2 text-sm font-semibold'>
                        <Icon className='size-4 text-muted-foreground' aria-hidden />
                        {title}
                        <span className='font-normal text-muted-foreground'>({sectionItems.length})</span>
                     </h2>
                     <ul className={GRID}>
                        {sectionItems.map((item) => (
                           <ItemCard key={item.id} householdId={householdId} item={item} onEdit={onEdit} />
                        ))}
                     </ul>
                  </section>
               )
            })
         )}

         {basket.length > 0 && (
            <details className='group rounded-2xl border p-3'>
               <summary className='flex cursor-pointer list-none items-center gap-2 px-2 text-sm font-semibold [&::-webkit-details-marker]:hidden'>
                  <ChevronRight className='size-4 transition-transform group-open:rotate-90' aria-hidden />
                  In the basket ({basket.length})
               </summary>
               <ul className={`mt-3 ${GRID}`}>
                  {basket.map((item) => (
                     <ItemCard key={item.id} householdId={householdId} item={item} onEdit={onEdit} />
                  ))}
               </ul>
               <div className='mt-2 flex justify-end'>
                  <Button variant='outline' size='sm' onClick={clearBasket} disabled={clear.isPending}>
                     <Trash2 />
                     Clear basket
                  </Button>
               </div>
            </details>
         )}
      </div>
   )
}

export default ShoppingList
