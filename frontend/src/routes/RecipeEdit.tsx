import { useState } from 'react'
import { ArrowLeft, RefreshCw, WifiOff } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useHousehold } from '@/features/households/householdsApi'
import { RecipeForm, type PhotoChange, type RecipeDraft } from '@/features/recipes/RecipeForm'
import { useRecipe, useRecipeImage, useSaveRecipe, type Recipe, type RecipeInput } from '@/features/recipes/recipesApi'

/** /recipes/new and /recipes/:recipeId/edit. A draft can come in as router state (e.g. from an import). */
const RecipeEdit = () => {
   const { recipeId } = useParams()
   const household = useHousehold()
   const existing = useRecipe(household.id, recipeId ?? null)
   const location = useLocation()
   const state = location.state as { draft?: RecipeDraft; partial?: boolean } | null
   const draft = state?.draft

   if (recipeId && existing.isPending) return <div className='h-96 animate-pulse rounded-2xl bg-muted' aria-busy='true' aria-label='Loading the recipe' />
   if (recipeId && existing.isError) {
      return (
         <EmptyState Icon={WifiOff} title='Couldn’t load the recipe' description={apiError(existing.error).message}>
            <Button variant='outline' onClick={() => void existing.refetch()}>
               <RefreshCw />
               Try again
            </Button>
         </EmptyState>
      )
   }
   return <Editor key={recipeId ?? 'new'} householdId={household.id} recipe={existing.data ?? null} draft={draft ?? null} partial={state?.partial === true} />
}

function Editor({ householdId, recipe, draft, partial }: { householdId: string; recipe: Recipe | null; draft: RecipeDraft | null; partial: boolean }) {
   const navigate = useNavigate()
   const save = useSaveRecipe(householdId, recipe?.id ?? null)
   const image = useRecipeImage(householdId)
   // An imported draft brings the page's photo; it's fetched by the server once the recipe is saved.
   const [photo, setPhoto] = useState<PhotoChange>(!recipe && draft?.imageUrl ? { kind: 'remote', url: draft.imageUrl } : { kind: 'keep' })
   const initial: RecipeDraft = recipe ? { ...recipe, ingredients: recipe.ingredients.map((i) => i.text) } : { ...draft, imageUrl: null }
   const back = recipe ? `/recipes/${recipe.id}` : '/recipes'

   const submit = (input: RecipeInput) =>
      save.mutate(input, {
         onSuccess: async (saved) => {
            try {
               if (photo.kind === 'file') await image.mutateAsync({ id: saved.id, file: photo.file })
               if (photo.kind === 'remote') await image.mutateAsync({ id: saved.id, file: { url: photo.url } })
               if (photo.kind === 'remove' && saved.imageUrl) await image.mutateAsync({ id: saved.id, file: null })
            } catch (e) {
               // The recipe is saved; only the photo failed. Say so and go on.
               toast.error(`Saved, but the photo couldn’t be stored: ${apiError(e).message}`)
            }
            toast.success(recipe ? 'Recipe saved' : 'Recipe added')
            navigate(`/recipes/${saved.id}`, { replace: !recipe })
         },
      })

   return (
      <>
         <Link
            to={back}
            className='mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50'
         >
            <ArrowLeft className='size-4' aria-hidden />
            {recipe ? recipe.title : 'Recipes'}
         </Link>
         <h1 className='mb-6 text-2xl font-semibold sm:text-3xl'>{recipe ? 'Edit recipe' : draft ? 'Imported recipe' : 'New recipe'}</h1>
         {draft && !recipe && (
            <p role='status' className='mb-6 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm'>
               {partial
                  ? 'This page had no recipe data, so only the title and photo were taken. Add the ingredients and steps below.'
                  : 'Read from the website. Check it, change what you like, then save.'}
            </p>
         )}
         <RecipeForm
            householdId={householdId}
            initial={initial}
            photo={photo}
            onPhoto={setPhoto}
            submitLabel={recipe ? 'Save recipe' : 'Add recipe'}
            pending={save.isPending || image.isPending}
            error={save.error}
            onSubmit={submit}
         />
      </>
   )
}

export default RecipeEdit
