import { ChefHat, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMinutes } from './format'
import type { RecipeSummary } from './recipesApi'
import { Stars } from './Stars'

/** A recipe in the grid: photo, title (the link), stars, time, tags. */
export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
   return (
      <li className='group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-md'>
         <div className='aspect-4/3 bg-muted'>
            {recipe.imageUrl ? (
               <img src={recipe.imageUrl} alt='' loading='lazy' className='size-full object-cover' />
            ) : (
               <span className='grid size-full place-items-center text-muted-foreground' aria-hidden>
                  <ChefHat className='size-10' />
               </span>
            )}
         </div>
         <div className='flex flex-1 flex-col gap-1.5 p-3'>
            <h3 className='font-semibold leading-snug'>
               {/* The whole card is clickable through the link's stretched area. */}
               <Link to={`/recipes/${recipe.id}`} className='outline-none after:absolute after:inset-0'>
                  {recipe.title}
               </Link>
            </h3>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
               <Stars value={recipe.ratingAvg} count={recipe.ratingCount} />
               {recipe.totalMinutes !== null && (
                  <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                     <Clock className='size-3.5' aria-hidden />
                     {formatMinutes(recipe.totalMinutes)}
                  </span>
               )}
            </div>
            {recipe.tags.length > 0 && (
               <ul className='mt-auto flex flex-wrap gap-1 pt-1' aria-label='Tags'>
                  {recipe.tags.slice(0, 4).map((t) => (
                     <li key={t} className='rounded-full bg-muted px-2 py-0.5 text-xs'>
                        {t}
                     </li>
                  ))}
               </ul>
            )}
         </div>
      </li>
   )
}
