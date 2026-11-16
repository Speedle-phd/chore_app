import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, ShoppingCart, Trash2, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Temporal } from 'temporal-polyfill'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useCalendar, useDeleteItem, type CalendarInstance } from '@/features/calendar/calendarApi'
import { instantToParts, viewerTimeZone } from '@/features/calendar/time'
import { dayLabel } from '@/features/chores/format'
import { cn } from '@/lib/utils'
import { AddMealDialog } from './AddMealDialog'
import { WeekIngredientsDialog } from './WeekIngredientsDialog'
import { addDays, MEAL_SLOTS, mondayOf, slotOf, weekDays, weekLabel, weekRange } from './week'

/** Recipes → Meal plan: a week of meals, day by day; add, remove, and put the week's ingredients on a list. */
export function MealPlan({ householdId, monday, onWeek }: { householdId: string; monday: string; onWeek: (monday: string) => void }) {
   const zone = viewerTimeZone()
   const today = Temporal.Now.plainDateISO().toString()
   const meals = useCalendar(householdId, weekRange(monday, zone), { kinds: ['meal'], memberIds: [] })
   const remove = useDeleteItem(householdId)
   const [adding, setAdding] = useState<string | null>(null)
   const [shopping, setShopping] = useState(false)
   const local = (i: CalendarInstance) => (i.allDay ? { date: i.start, time: '18:30' } : instantToParts(i.start, zone))
   const byDay = new Map<string, CalendarInstance[]>()
   for (const m of meals.data ?? []) byDay.set(local(m).date, [...(byDay.get(local(m).date) ?? []), m])

   return (
      <div className='space-y-5'>
         <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-1'>
               <Button variant='outline' size='icon' aria-label='Previous week' onClick={() => onWeek(addDays(monday, -7))}>
                  <ChevronLeft />
               </Button>
               <Button variant='outline' size='icon' aria-label='Next week' onClick={() => onWeek(addDays(monday, 7))}>
                  <ChevronRight />
               </Button>
               <h2 className='ms-2 font-semibold' aria-live='polite'>
                  {weekLabel(monday)}
               </h2>
               {monday !== mondayOf(today) && (
                  <Button variant='ghost' size='sm' onClick={() => onWeek(mondayOf(today))}>
                     This week
                  </Button>
               )}
            </div>
            <Button onClick={() => setShopping(true)} disabled={!meals.data?.length}>
               <ShoppingCart />
               Add this week’s ingredients
            </Button>
         </div>

         {meals.isError ? (
            <EmptyState Icon={WifiOff} title='Couldn’t load the meal plan' description={apiError(meals.error).message}>
               <Button variant='outline' onClick={() => void meals.refetch()}>
                  <RefreshCw />
                  Try again
               </Button>
            </EmptyState>
         ) : (
            <ol className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-4', meals.isPending && 'animate-pulse')} aria-busy={meals.isPending}>
               {weekDays(monday).map((date) => {
                  const dayMeals = (byDay.get(date) ?? []).sort((a, b) => local(a).time.localeCompare(local(b).time))
                  return (
                     <li key={date} className={cn('flex flex-col gap-2 rounded-2xl border bg-card p-3', date === today && 'border-primary/50')}>
                        <h3 className='text-sm font-semibold'>
                           {dayLabel(date, today)}
                           {date === today && <span className='sr-only'> (today)</span>}
                        </h3>
                        {dayMeals.length > 0 && (
                           <ul className='space-y-1.5'>
                              {dayMeals.map((m) => (
                                 <li key={m.id} className='flex items-start gap-2 rounded-lg border px-2 py-1.5 text-sm'>
                                    <span className='min-w-0 flex-1'>
                                       <span className='block text-xs text-muted-foreground'>
                                          {MEAL_SLOTS.find((s) => s.id === slotOf(local(m).time))?.label} · for {m.meal?.servings ?? 4}
                                       </span>
                                       {m.meal?.recipeId ? (
                                          <Link
                                             to={`/recipes/${m.meal.recipeId}`}
                                             className='font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50'
                                          >
                                             {m.title}
                                          </Link>
                                       ) : (
                                          <span className='font-medium'>{m.title}</span>
                                       )}
                                    </span>
                                    <Button
                                       variant='ghost'
                                       size='icon'
                                       aria-label={`Remove ${m.title} on ${dayLabel(date, today)}`}
                                       disabled={remove.isPending}
                                       onClick={() =>
                                          remove.mutate(m.itemId, {
                                             onSuccess: () => toast.success(`Removed ${m.title}`),
                                             onError: (e) => toast.error(apiError(e).message),
                                          })
                                       }
                                    >
                                       <Trash2 className='text-destructive' />
                                    </Button>
                                 </li>
                              ))}
                           </ul>
                        )}
                        <Button variant='ghost' size='sm' className='mt-auto self-start' onClick={() => setAdding(date)} aria-label={`Add meal on ${dayLabel(date, today)}`}>
                           <Plus />
                           Add meal
                        </Button>
                     </li>
                  )
               })}
            </ol>
         )}

         {adding && <AddMealDialog householdId={householdId} date={adding} onClose={() => setAdding(null)} />}
         {shopping && <WeekIngredientsDialog householdId={householdId} monday={monday} onClose={() => setShopping(false)} />}
      </div>
   )
}
