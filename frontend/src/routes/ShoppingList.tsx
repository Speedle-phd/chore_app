import { useMemo, useState } from 'react'
import { Check, RefreshCw, ShoppingBasket, Tags, Trash2, WifiOff } from 'lucide-react'
import { AnimatePresence, LayoutGroup } from 'motion/react'
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
import { BasketChip, ItemCard } from '@/features/shopping/ItemCard'
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

/** Cards fill the row: as many columns as fit, at least 10.5 rem each (two on a phone; long German words fit). */
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,10.5rem),1fr))] gap-2'

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

   const total = items.data.length
   const done = basket.length
   const percent = total ? Math.round((done / total) * 100) : 0

   if (total === 0) {
      return <EmptyState Icon={ShoppingBasket} title='Nothing on this list yet' description='Add what you need above; everyone at home sees it right away.' />
   }

   return (
      <LayoutGroup>
         <div className='space-y-6'>
            {/* Stays in view while scrolling through the shop. */}
            <div className='sticky top-16 z-10 rounded-2xl border bg-card/90 px-4 py-3 shadow-sm backdrop-blur supports-backdrop-filter:bg-card/75'>
               <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                  <p className='flex items-center gap-2 text-sm font-medium' role='status'>
                     <ShoppingBasket className='size-4 text-primary' aria-hidden />
                     {done === total ? (
                        <span>Everything’s in the basket</span>
                     ) : (
                        <span>
                           <span className='tabular-nums'>{done}</span> of <span className='tabular-nums'>{total}</span> in the basket
                           <span className='font-normal text-muted-foreground'> · {total - done} to get</span>
                        </span>
                     )}
                  </p>
                  <div className='order-last h-2 basis-full overflow-hidden rounded-full bg-muted sm:order-none sm:flex-1 sm:basis-auto' aria-hidden>
                     <div className='h-full rounded-full bg-primary transition-[width] duration-500 ease-out' style={{ width: `${percent}%` }} />
                  </div>
                  {done > 0 && (
                     <Button variant={done === total ? 'default' : 'outline'} size='sm' onClick={clearBasket} disabled={clear.isPending} className='ms-auto sm:ms-0'>
                        <Trash2 />
                        Clear basket
                     </Button>
                  )}
               </div>
            </div>

            {sections.length === 0 ? (
               <div className='flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center'>
                  <span className='grid size-12 place-items-center rounded-full bg-primary text-primary-foreground'>
                     <Check className='size-6' strokeWidth={3} aria-hidden />
                  </span>
                  <h2 className='font-semibold'>All done</h2>
                  <p className='max-w-sm text-sm text-muted-foreground'>Everything is in the basket. Clear the basket when you’re home, or tap a thing below to put it back.</p>
               </div>
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
                           <AnimatePresence initial={false}>
                              {sectionItems.map((item) => (
                                 <ItemCard key={item.id} householdId={householdId} item={item} onEdit={onEdit} />
                              ))}
                           </AnimatePresence>
                        </ul>
                     </section>
                  )
               })
            )}

            {basket.length > 0 && (
               <section aria-label='In the basket' className='rounded-2xl bg-muted/50 p-3'>
                  <h2 className='mb-2 flex items-center gap-2 px-1 text-sm font-semibold'>
                     <ShoppingBasket className='size-4 text-muted-foreground' aria-hidden />
                     In the basket
                     <span className='font-normal text-muted-foreground'>({basket.length}) · tap to put back</span>
                  </h2>
                  <ul className='flex flex-wrap gap-1.5'>
                     <AnimatePresence initial={false}>
                        {basket.map((item) => (
                           <BasketChip key={item.id} householdId={householdId} item={item} />
                        ))}
                     </AnimatePresence>
                  </ul>
               </section>
            )}
         </div>
      </LayoutGroup>
   )
}

export default ShoppingList
