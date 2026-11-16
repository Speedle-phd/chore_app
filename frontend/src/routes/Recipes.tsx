import { useCallback, useEffect, useState } from 'react'
import { Link2, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Temporal } from 'temporal-polyfill'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHousehold } from '@/features/households/householdsApi'
import { MealPlan } from '@/features/meals/MealPlan'
import { mondayOf } from '@/features/meals/week'
import { paramsFromQuery, queryFromParams } from '@/features/recipes/format'
import type { RecipeQuery } from '@/features/recipes/recipesApi'
import { ImportDialog } from '@/features/recipes/ImportDialog'
import { RecipeBrowser } from '@/features/recipes/RecipeBrowser'
import { usePageMeta } from './usePageMeta'

/** /recipes — recipes (search in the URL) and the meal plan (?tab=plan&week=YYYY-MM-DD). */
const Recipes = () => {
   const meta = usePageMeta('/recipes')
   const household = useHousehold()
   const [params, setParams] = useSearchParams()
   // The search lives in state (updates queue up) and is mirrored into the URL; the router applies
   // URL changes asynchronously, so deriving from the URL lost quick changes in a row.
   const [query, setQuery] = useState<RecipeQuery>(() => queryFromParams(params))
   const onQuery = useCallback((update: (q: RecipeQuery) => RecipeQuery) => setQuery(update), [])
   const tab = params.get('tab') === 'plan' ? 'plan' : 'recipes'
   const week = params.get('week')
   const monday = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : Temporal.Now.plainDateISO().toString())
   const [importing, setImporting] = useState(false)
   const wanted = new URLSearchParams(paramsFromQuery(query)).toString()
   useEffect(() => {
      // Only when it differs: setParams changes identity with every navigation.
      if (tab === 'recipes' && params.toString() !== wanted) setParams(new URLSearchParams(wanted), { replace: true })
   }, [wanted, tab, params, setParams])

   return (
      <>
         <PageHeader
            title={meta?.label ?? 'Recipes'}
            description={meta?.subtitle}
            Icon={meta?.Icon}
            action={
               <div className='flex flex-wrap gap-2'>
                  <Button variant='outline' className='h-9' onClick={() => setImporting(true)}>
                     <Link2 />
                     Import from link
                  </Button>
                  <Link
                     to='/recipes/new'
                     className='inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50'
                  >
                     <Plus className='size-4' aria-hidden />
                     New recipe
                  </Link>
               </div>
            }
         />
         <Tabs value={tab} onValueChange={(v) => setParams(v === 'plan' ? { tab: 'plan' } : paramsFromQuery(query), { replace: true })}>
            <TabsList className='mb-5'>
               <TabsTrigger value='recipes'>Recipes</TabsTrigger>
               <TabsTrigger value='plan'>Meal plan</TabsTrigger>
            </TabsList>
            <TabsContent value='recipes'>
               <RecipeBrowser householdId={household.id} query={query} onQuery={onQuery} />
            </TabsContent>
            <TabsContent value='plan'>
               <MealPlan householdId={household.id} monday={monday} onWeek={(m) => setParams({ tab: 'plan', week: m }, { replace: true })} />
            </TabsContent>
         </Tabs>
         {importing && <ImportDialog householdId={household.id} onClose={() => setImporting(false)} />}
      </>
   )
}

export default Recipes
