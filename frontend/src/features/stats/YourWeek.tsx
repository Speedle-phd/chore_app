import { ChevronRight, Flame, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Temporal } from 'temporal-polyfill'
import { Button } from '@/components/ui/button'
import type { Member } from '@/features/households/householdsApi'
import { BadgeAnimal } from './BadgeAnimal'
import { nextBadge, ordinal } from './format'
import { periodRange } from './periods'
import { useStats } from './statsApi'

/** Chores → To do: this week at a glance for the signed-in member (points, rank, streak, next badge). */
export function YourWeek({ householdId, me }: { householdId: string; me: Member | undefined }) {
   const stats = useStats(householdId, periodRange('week', Temporal.Now.plainDateISO().toString()))
   if (!me) return null
   if (stats.isPending) return <div className='h-20 animate-pulse rounded-2xl bg-muted' aria-busy='true' aria-label='Loading your week' />
   if (stats.isError) {
      return (
         <div className='flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 text-sm text-muted-foreground'>
            Couldn’t load your week.
            <Button variant='outline' size='sm' onClick={() => void stats.refetch()}>
               <RefreshCw />
               Try again
            </Button>
         </div>
      )
   }

   const data = stats.data
   const mine = data.members.find((m) => m.memberId === me.id)
   if (!mine) return null
   const ranking = data.motivation.leaderboard ? [...data.members].filter((m) => m.points > 0).sort((a, b) => b.points - a.points) : []
   const rank = mine.points > 0 ? ranking.findIndex((m) => m.memberId === me.id) + 1 : 0
   const next = mine.progress ? nextBadge(mine.progress) : null
   const nextDef = next && data.badgeCatalog.find((d) => d.id === next.id)

   return (
      <section aria-label='Your week' className='rounded-2xl border bg-card p-4'>
         <div className='flex flex-wrap items-center gap-x-8 gap-y-3'>
            <div>
               <p className='text-xs text-muted-foreground'>Your week</p>
               <p className='text-lg font-semibold tabular-nums'>
                  {mine.points} {mine.points === 1 ? 'point' : 'points'}
                  {rank > 0 && <span className='ms-2 text-sm font-normal text-muted-foreground'>{ordinal(rank)} of {ranking.length}</span>}
               </p>
            </div>
            {mine.streak && (
               <div>
                  <p className='text-xs text-muted-foreground'>Streak</p>
                  <p className='flex items-center gap-1 text-lg font-semibold tabular-nums'>
                     <Flame className={mine.streak.current ? 'size-4 text-orange-500' : 'size-4 text-muted-foreground'} aria-hidden />
                     {mine.streak.current} {mine.streak.current === 1 ? 'day' : 'days'}
                  </p>
               </div>
            )}
            {next && nextDef && (
               <div className='min-w-48 flex-1'>
                  <p className='text-xs text-muted-foreground'>Next badge</p>
                  <p className='flex items-center gap-2 text-sm font-medium'>
                     <BadgeAnimal animal={nextDef.animal} accessory={nextDef.accessory} earned={false} className='size-7' />
                     {nextDef.name}
                     <span className='font-normal text-muted-foreground tabular-nums'>
                        {next.value} / {next.goal}
                     </span>
                  </p>
                  <span className='mt-1.5 block h-1.5 max-w-60 rounded-full bg-muted' aria-hidden>
                     <span className='block h-full rounded-full bg-(--chart-1)' style={{ width: `${(next.value / next.goal) * 100}%` }} />
                  </span>
               </div>
            )}
            <div className='ms-auto flex flex-wrap gap-x-4 gap-y-1 text-sm'>
               <Link to='/chores?tab=stats' className='font-medium text-primary underline-offset-4 hover:underline'>
                  All stats
               </Link>
               <Link to={`/members/${me.id}`} className='inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 hover:underline'>
                  Your overview
                  <ChevronRight className='size-4' aria-hidden />
               </Link>
            </div>
         </div>
      </section>
   )
}
