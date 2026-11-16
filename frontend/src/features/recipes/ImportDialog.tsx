import { useId, useState } from 'react'
import { Link2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import FormAlert from '@/features/auth/FormAlert'
import type { RecipeDraft } from './RecipeForm'
import { useImportRecipe } from './recipesApi'

/** Paste a recipe link → the server reads the page → the form opens filled in, to check and save. */
export function ImportDialog({ householdId, onClose }: { householdId: string; onClose: () => void }) {
   const id = useId()
   const navigate = useNavigate()
   const read = useImportRecipe(householdId)
   const [url, setUrl] = useState('')

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!url.trim()) return
      read.mutate(url.trim(), {
         onSuccess: (d) => {
            const draft: RecipeDraft = {
               title: d.title,
               description: d.description,
               servings: d.servings ?? 4,
               prepMinutes: d.prepMinutes,
               cookMinutes: d.cookMinutes,
               ingredients: d.ingredients,
               steps: d.steps,
               tags: d.tags,
               sourceUrl: d.sourceUrl,
               imageUrl: d.imageUrl,
            }
            navigate('/recipes/new', { state: { draft, partial: !d.complete } })
         },
      })
   }

   return (
      <Dialog open onOpenChange={(next) => !next && !read.isPending && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>Import a recipe</DialogTitle>
               <DialogDescription>Paste the link of a recipe page. You can check and change everything before it’s saved.</DialogDescription>
            </DialogHeader>
            <form id={`${id}-form`} onSubmit={submit} className='space-y-2'>
               {read.isError && <FormAlert tone='error' error={apiError(read.error)} />}
               <label htmlFor={`${id}-url`} className='text-sm font-medium'>
                  Link
               </label>
               <Input id={`${id}-url`} type='url' inputMode='url' value={url} onChange={(e) => setUrl(e.target.value)} placeholder='https://…' autoFocus className='h-10' />
            </form>
            <DialogFooter>
               <Button type='submit' form={`${id}-form`} size='lg' className='px-4' disabled={!url.trim() || read.isPending}>
                  <Link2 />
                  {read.isPending ? 'Reading the page…' : 'Read recipe'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
