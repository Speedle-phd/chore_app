import { useId, useState } from 'react'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import FormAlert from '@/features/auth/FormAlert'
import { useSaveItem } from '@/features/calendar/calendarApi'
import { selectClass } from '@/features/calendar/styles'
import { viewerTimeZone } from '@/features/calendar/time'
import { useRecipes } from '@/features/recipes/recipesApi'
import { cn } from '@/lib/utils'
import { MEAL_SLOTS, type MealSlot } from './week'

const OTHER = 'other'

/** Plan a meal: a recipe (or something else, e.g. "Pizza out"), a day, breakfast/lunch/dinner, how many. */
export function AddMealDialog({ householdId, date, recipeId, onClose }: { householdId: string; date: string; recipeId?: string; onClose: () => void }) {
   const id = useId()
   const recipes = useRecipes(householdId, { q: '', tags: [], minRating: null, sort: 'title' })
   const save = useSaveItem(householdId, null)
   const [day, setDay] = useState(date)
   const [choice, setChoice] = useState(recipeId ?? '')
   const [title, setTitle] = useState('')
   const [slot, setSlot] = useState<MealSlot>('dinner')
   const [servings, setServings] = useState('')
   const recipe = recipes.data?.find((r) => r.id === choice)
   const isOther = choice === OTHER
   const count = Number(servings || recipe?.servings || 4)
   const valid = Boolean(day) && (isOther ? title.trim().length > 0 : Boolean(recipe)) && Number.isInteger(count) && count >= 1 && count <= 100

   const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!valid) return
      const s = MEAL_SLOTS.find((x) => x.id === slot) ?? MEAL_SLOTS[2]
      save.mutate(
         {
            kind: 'meal',
            title: isOther ? title.trim() : (recipe?.title ?? ''),
            notes: '',
            allDay: false,
            start: `${day}T${s.start}`,
            end: `${day}T${s.end}`,
            timezone: viewerTimeZone(),
            memberIds: [],
            rrule: null,
            afterDays: null,
            chore: { effort: 1, assignmentMode: 'anyone', rotation: false },
            birthYear: null,
            meal: { recipeId: isOther ? null : choice, servings: count },
         },
         {
            onSuccess: () => {
               toast.success('Meal planned')
               onClose()
            },
         },
      )
   }

   return (
      <Dialog open onOpenChange={(next) => !next && !save.isPending && onClose()}>
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle>Plan a meal</DialogTitle>
               <DialogDescription>It shows in the calendar, and its ingredients can go on a list with the rest of the week.</DialogDescription>
            </DialogHeader>
            <form id={`${id}-form`} onSubmit={submit} className='space-y-4' noValidate>
               {save.isError && <FormAlert tone='error' error={apiError(save.error)} />}
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-recipe`} className='text-sm font-medium'>
                     What
                  </label>
                  <select id={`${id}-recipe`} className={cn(selectClass, 'w-full')} value={choice} onChange={(e) => setChoice(e.target.value)}>
                     <option value='' disabled>
                        {recipes.isPending ? 'Loading recipes…' : 'Pick a recipe'}
                     </option>
                     {(recipes.data ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                           {r.title}
                        </option>
                     ))}
                     <option value={OTHER}>Something else…</option>
                  </select>
               </div>
               {isOther && (
                  <div className='space-y-1.5'>
                     <label htmlFor={`${id}-title`} className='text-sm font-medium'>
                        Name
                     </label>
                     <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder='e.g. Pizza out, Leftovers' autoFocus />
                  </div>
               )}
               <div className='space-y-1.5'>
                  <span className='text-sm font-medium'>Day</span>
                  <DatePicker value={day} onChange={setDay} aria-label='Day' />
               </div>
               <div className='space-y-1.5'>
                  <span id={`${id}-slot`} className='text-sm font-medium'>
                     When
                  </span>
                  <RadioGroup value={slot} onValueChange={(v) => setSlot(v as MealSlot)} aria-labelledby={`${id}-slot`} className='flex flex-wrap gap-1'>
                     {MEAL_SLOTS.map((s) => (
                        <label key={s.id} className='flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted'>
                           <RadioGroupItem value={s.id} />
                           {s.label}
                        </label>
                     ))}
                  </RadioGroup>
               </div>
               <div className='space-y-1.5'>
                  <label htmlFor={`${id}-servings`} className='text-sm font-medium'>
                     Servings
                  </label>
                  <Input
                     id={`${id}-servings`}
                     inputMode='numeric'
                     value={servings}
                     placeholder={String(recipe?.servings ?? 4)}
                     onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))}
                     className='w-24'
                  />
                  <p className='text-xs text-muted-foreground'>Ingredients are scaled to this.</p>
               </div>
            </form>
            <DialogFooter>
               <Button type='submit' form={`${id}-form`} size='lg' className='px-4' disabled={!valid || save.isPending}>
                  {save.isPending ? 'Saving…' : 'Plan meal'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
