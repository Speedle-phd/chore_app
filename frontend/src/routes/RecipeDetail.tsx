import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarPlus, ChefHat, Clock, CookingPot, ExternalLink, Pencil, RefreshCw, Trash2, UtensilsCrossed, WifiOff } from 'lucide-react'
import { Temporal } from 'temporal-polyfill'
import { AddMealDialog } from '@/features/meals/AddMealDialog'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { canDeleteShared } from '@/features/households/permissions'
import { CookMode } from '@/features/recipes/CookMode'
import { formatMinutes } from '@/features/recipes/format'
import { IngredientsPanel } from '@/features/recipes/IngredientsPanel'
import { useCookedRecipe, useDeleteRecipe, useRateRecipe, useRecipe } from '@/features/recipes/recipesApi'
import { StarInput, Stars } from '@/features/recipes/Stars'

const linkClass = 'inline-flex items-center gap-1.5 rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50'

/** /recipes/:recipeId — photo, ratings, ingredients (scaled, to a list), steps, cook mode. */
const RecipeDetail = () => {
   const { recipeId = '' } = useParams()
   const navigate = useNavigate()
   const household = useHousehold()
   const members = useMembers(household.id)
   const me = useMemo(() => (members.data ?? []).find((m) => m.isMe), [members.data])
   const recipe = useRecipe(household.id, recipeId)
   const rate = useRateRecipe(household.id, recipeId)
   const cooked = useCookedRecipe(household.id, recipeId)
   const remove = useDeleteRecipe(household.id)
   const [cooking, setCooking] = useState(false)
   const [deleting, setDeleting] = useState(false)
   const [planning, setPlanning] = useState(false)

   const back = (
      <Link to='/recipes' className={`${linkClass} mb-4`}>
         <ArrowLeft className='size-4' aria-hidden />
         Recipes
      </Link>
   )
   if (recipe.isPending) return <div className='h-72 animate-pulse rounded-2xl bg-muted' aria-busy='true' aria-label='Loading the recipe' />
   if (recipe.isError) {
      const missing = apiError(recipe.error).message === 'Recipe not found'
      return (
         <>
            {back}
            <EmptyState Icon={missing ? ChefHat : WifiOff} title={missing ? 'Recipe not found' : 'Couldn’t load the recipe'} description={missing ? 'It may have been deleted.' : apiError(recipe.error).message}>
               {!missing && (
                  <Button variant='outline' onClick={() => void recipe.refetch()}>
                     <RefreshCw />
                     Try again
                  </Button>
               )}
            </EmptyState>
         </>
      )
   }

   const r = recipe.data
   const mayDelete = canDeleteShared(household.role, r.createdBy === me?.id)
   const failed = (e: unknown) => toast.error(apiError(e).message)
   return (
      <>
         {back}
         <article className='space-y-6'>
            <header className='grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start'>
               <div className='aspect-4/3 overflow-hidden rounded-2xl bg-muted'>
                  {r.imageUrl ? (
                     <img src={r.imageUrl} alt={`Photo of ${r.title}`} className='size-full object-cover' />
                  ) : (
                     <span className='grid size-full place-items-center text-muted-foreground' aria-hidden>
                        <ChefHat className='size-14' />
                     </span>
                  )}
               </div>
               <div className='space-y-4'>
                  <h1 className='text-2xl font-semibold sm:text-3xl'>{r.title}</h1>
                  <Stars value={r.ratingAvg} count={r.ratingCount} />
                  {r.description && <p className='whitespace-pre-wrap text-muted-foreground'>{r.description}</p>}
                  <dl className='flex flex-wrap gap-x-6 gap-y-2 text-sm'>
                     {r.prepMinutes !== null && (
                        <div className='flex items-center gap-1.5'>
                           <dt className='text-muted-foreground'>Prep</dt>
                           <dd className='font-medium'>{formatMinutes(r.prepMinutes)}</dd>
                        </div>
                     )}
                     {r.cookMinutes !== null && (
                        <div className='flex items-center gap-1.5'>
                           <dt className='text-muted-foreground'>Cook</dt>
                           <dd className='font-medium'>{formatMinutes(r.cookMinutes)}</dd>
                        </div>
                     )}
                     {r.totalMinutes !== null && (
                        <div className='flex items-center gap-1.5'>
                           <dt>
                              <Clock className='size-4 text-muted-foreground' aria-label='Total' />
                           </dt>
                           <dd className='font-medium'>{formatMinutes(r.totalMinutes)}</dd>
                        </div>
                     )}
                  </dl>
                  {r.tags.length > 0 && (
                     <ul className='flex flex-wrap gap-1.5' aria-label='Tags'>
                        {r.tags.map((t) => (
                           <li key={t}>
                              <Link
                                 to={`/recipes?tags=${encodeURIComponent(t)}`}
                                 className='rounded-full bg-muted px-2.5 py-1 text-xs outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50'
                              >
                                 {t}
                              </Link>
                           </li>
                        ))}
                     </ul>
                  )}
                  <div className='space-y-1'>
                     <p className='text-sm font-medium'>Your rating</p>
                     <StarInput value={r.myRating} disabled={rate.isPending} onChange={(stars) => rate.mutate(stars, { onError: failed })} />
                  </div>
                  <div className='flex flex-wrap gap-2'>
                     <Button disabled={!r.steps.length} onClick={() => setCooking(true)}>
                        <CookingPot />
                        Cook mode
                     </Button>
                     <Button variant='outline' onClick={() => setPlanning(true)}>
                        <CalendarPlus />
                        Plan it
                     </Button>
                     <Button
                        variant='outline'
                        disabled={cooked.isPending}
                        onClick={() => cooked.mutate(undefined, { onSuccess: () => toast.success('Enjoy your meal!'), onError: failed })}
                     >
                        <UtensilsCrossed />
                        We cooked it
                     </Button>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                     {r.cookedCount
                        ? `Cooked ${r.cookedCount} ${r.cookedCount === 1 ? 'time' : 'times'}, last on ${new Date(r.lastCookedAt ?? '').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : 'Not cooked yet'}
                  </p>
               </div>
            </header>

            <div className='grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start'>
               <IngredientsPanel householdId={household.id} recipe={r} />
               <section aria-labelledby='recipe-steps' className='space-y-3 rounded-2xl border bg-card p-4'>
                  <h2 id='recipe-steps' className='text-lg font-semibold'>
                     Steps
                  </h2>
                  {r.steps.length ? (
                     <ol className='space-y-3'>
                        {r.steps.map((s, i) => (
                           <li key={i} className='flex gap-3'>
                              <span className='grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary' aria-hidden>
                                 {i + 1}
                              </span>
                              <p className='pt-0.5 whitespace-pre-wrap'>{s}</p>
                           </li>
                        ))}
                     </ol>
                  ) : (
                     <p className='text-sm text-muted-foreground'>No steps written down.</p>
                  )}
               </section>
            </div>

            <footer className='flex flex-wrap items-center gap-2 border-t pt-4'>
               <Link to={`/recipes/${r.id}/edit`} className='inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'>
                  <Pencil className='size-4' aria-hidden />
                  Edit
               </Link>
               <ConfirmDeleteDialog
                  open={deleting}
                  onOpenChange={setDeleting}
                  trigger={
                     <Button variant='ghost' disabled={!mayDelete}>
                        <Trash2 className='text-destructive' />
                        Delete
                     </Button>
                  }
                  title={`Delete “${r.title}”?`}
                  description='The recipe, its photo and ratings are deleted. Planned meals keep their name.'
                  confirmLabel='Delete recipe'
                  isPending={remove.isPending}
                  onConfirm={() =>
                     remove.mutate(r.id, {
                        onSuccess: () => {
                           setDeleting(false)
                           toast.success('Recipe deleted')
                           navigate('/recipes', { replace: true })
                        },
                        onError: failed,
                     })
                  }
               />
               {!mayDelete && <span className='text-xs text-muted-foreground'>Only who added it or an admin can delete it.</span>}
               {r.sourceUrl && (
                  <a href={r.sourceUrl} target='_blank' rel='noopener noreferrer' className={`${linkClass} ms-auto text-primary`}>
                     <ExternalLink className='size-4' aria-hidden />
                     Original recipe
                     <span className='sr-only'>(opens in a new tab)</span>
                  </a>
               )}
            </footer>
         </article>
         {cooking && <CookMode recipe={r} onClose={() => setCooking(false)} />}
         {planning && <AddMealDialog householdId={household.id} date={Temporal.Now.plainDateISO().toString()} recipeId={r.id} onClose={() => setPlanning(false)} />}
      </>
   )
}

export default RecipeDetail
