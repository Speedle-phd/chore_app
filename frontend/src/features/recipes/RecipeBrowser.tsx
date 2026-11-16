import { useEffect, useId, useState } from 'react'
import { ChefHat, RefreshCw, Search, SearchX, WifiOff, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { pressedClass, selectClass } from '@/features/calendar/styles'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { RecipeCard } from './RecipeCard'
import { RECIPE_SORTS, useRecipes, useRecipeTags, type RecipeQuery, type RecipeSort } from './recipesApi'

/** Most tag chips shown above the grid (most used first). App choice. */
const TAG_CHIPS = 12

/** Search box, tag chips, minimum rating and sort above a grid of recipe cards. */
/** `onQuery` takes an update (applied to the latest state), so quick changes in a row never undo each other. */
export function RecipeBrowser({
   householdId,
   query,
   onQuery,
}: {
   householdId: string
   query: RecipeQuery
   onQuery: (update: (q: RecipeQuery) => RecipeQuery) => void
}) {
   const id = useId()
   const recipes = useRecipes(householdId, query)
   const tags = useRecipeTags(householdId)
   const [text, setText] = useState(query.q)
   const debounced = useDebounce(text, 250)
   // Typing settles into the URL; the guard keeps it from looping.
   useEffect(() => {
      // Only a settled value (equal to what's in the box): a stale one would bring back old text after "Clear filters".
      if (debounced === text && debounced !== query.q) onQuery((q) => ({ ...q, q: debounced }))
   }, [debounced, text, query.q, onQuery])
   const chips = [...new Set([...query.tags, ...(tags.data?.used ?? []).slice(0, TAG_CHIPS).map((t) => t.tag)])]
   const filtered = Boolean(query.q || query.tags.length || query.minRating)

   return (
      <div className='space-y-5'>
         <div className='flex flex-wrap items-end gap-3'>
            <div className='relative w-full sm:w-auto sm:min-w-56 sm:flex-1'>
               <label htmlFor={`${id}-q`} className='sr-only'>
                  Search recipes
               </label>
               <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden />
               <input
                  id={`${id}-q`}
                  type='search'
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder='Search title, ingredient or tag'
                  className='h-9 w-full rounded-lg border border-input bg-transparent ps-8 pe-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30'
               />
            </div>
            <div className='flex flex-col gap-1'>
               <label htmlFor={`${id}-min`} className='text-xs font-medium'>
                  Rating
               </label>
               <select
                  id={`${id}-min`}
                  className={selectClass}
                  value={query.minRating ?? ''}
                  onChange={(e) => {
                     const minRating = e.target.value ? Number(e.target.value) : null
                     onQuery((q) => ({ ...q, minRating }))
                  }}
               >
                  <option value=''>Any</option>
                  {[4, 3, 2].map((n) => (
                     <option key={n} value={n}>
                        {n}+ stars
                     </option>
                  ))}
               </select>
            </div>
            <div className='flex flex-col gap-1'>
               <label htmlFor={`${id}-sort`} className='text-xs font-medium'>
                  Sort
               </label>
               <select id={`${id}-sort`} className={selectClass} value={query.sort} onChange={(e) => {
                  const sort = e.target.value as RecipeSort
                  onQuery((q) => ({ ...q, sort }))
               }}>
                  {RECIPE_SORTS.map((s) => (
                     <option key={s.id} value={s.id}>
                        {s.label}
                     </option>
                  ))}
               </select>
            </div>
         </div>

         {chips.length > 0 && (
            <div className='flex flex-wrap items-center gap-2'>
               <ToggleGroup
                  multiple
                  aria-label='Tags'
                  variant='outline'
                  spacing={1}
                  className='flex-wrap'
                  value={query.tags}
                  onValueChange={(v) => onQuery((q) => ({ ...q, tags: v as string[] }))}
               >
                  {chips.map((t) => (
                     <ToggleGroupItem key={t} value={t} className={cn('h-8 px-3', pressedClass)}>
                        {t}
                     </ToggleGroupItem>
                  ))}
               </ToggleGroup>
               {filtered && (
                  <Button
                     variant='ghost'
                     size='sm'
                     onClick={() => {
                        setText('')
                        onQuery((q) => ({ q: '', tags: [], minRating: null, sort: q.sort }))
                     }}
                  >
                     <X />
                     Clear filters
                  </Button>
               )}
            </div>
         )}

         {recipes.isPending ? (
            <ul className='grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4' aria-busy='true' aria-label='Loading recipes'>
               {[0, 1, 2, 3].map((i) => (
                  <li key={i} className='h-64 animate-pulse rounded-2xl bg-muted' />
               ))}
            </ul>
         ) : recipes.isError ? (
            <EmptyState Icon={WifiOff} title='Couldn’t load recipes' description={apiError(recipes.error).message}>
               <Button variant='outline' onClick={() => void recipes.refetch()}>
                  <RefreshCw />
                  Try again
               </Button>
            </EmptyState>
         ) : recipes.data.length === 0 ? (
            filtered ? (
               <EmptyState Icon={SearchX} title='No recipes match' description='Try another word, fewer tags or a lower rating.' />
            ) : (
               <EmptyState Icon={ChefHat} title='No recipes yet' description='Add your family favourites, or import one from a website.'>
                  <Link
                     to='/recipes/new'
                     className='inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80'
                  >
                     Add a recipe
                  </Link>
               </EmptyState>
            )
         ) : (
            <>
               <p className='sr-only' role='status'>
                  {recipes.data.length} {recipes.data.length === 1 ? 'recipe' : 'recipes'}
               </p>
               <ul className={cn('grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4 transition-opacity', recipes.isPlaceholderData && 'opacity-60')}>
                  {recipes.data.map((r) => (
                     <RecipeCard key={r.id} recipe={r} />
                  ))}
               </ul>
            </>
         )}
      </div>
   )
}
