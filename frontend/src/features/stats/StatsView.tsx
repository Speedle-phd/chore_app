import { useState } from 'react'
import { Award, BarChart3, Flame, RefreshCw, WifiOff } from 'lucide-react'
import { Temporal } from 'temporal-polyfill'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import type { Member } from '@/features/households/householdsApi'
import { cn } from '@/lib/utils'
import { ActivityChart } from './ActivityChart'
import { BADGE_ICONS, pct } from './format'
import { BadgeGrid, Person, StatsCard, StatTile } from './parts'
import { PeriodPicker } from './PeriodPicker'
import { periodRange, type PeriodId } from './periods'
import { useStats, type MemberStats, type Stats } from './statsApi'

/** Chores → Stats: what got done, by whom, and (if switched on) leaderboard, streaks and badges. */
export function StatsView({ householdId, members }: { householdId: string; members: Member[] }) {
   const [period, setPeriod] = useState<PeriodId>('week')
   const today = Temporal.Now.plainDateISO().toString()
   const stats = useStats(householdId, periodRange(period, today))
   const data = stats.data

   return (
      <div className='space-y-8'>
         <PeriodPicker value={period} onChange={setPeriod} />

         {stats.isPending ? (
            <div className='space-y-4' aria-busy='true' aria-label='Loading statistics'>
               <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
                  {[0, 1, 2, 3].map((i) => (
                     <div key={i} className='h-20 animate-pulse rounded-xl bg-muted' />
                  ))}
               </div>
               <div className='h-56 animate-pulse rounded-xl bg-muted' />
            </div>
         ) : stats.isError || !data ? (
            <EmptyState Icon={WifiOff} title='Couldn’t load statistics' description={apiError(stats.error).message}>
               <Button variant='outline' onClick={() => void stats.refetch()}>
                  <RefreshCw />
                  Try again
               </Button>
            </EmptyState>
         ) : (
            // Refetching keeps the frame: the previous period stays, dimmed.
            <div className={cn('space-y-8 transition-opacity', stats.isPlaceholderData && 'opacity-60')} aria-busy={stats.isFetching}>
               <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
                  <StatTile label='Done' value={data.totals.done} />
                  <StatTile label='On time' value={pct(data.totals.onTimeRate)} />
                  <StatTile label='Points' value={data.totals.points} />
                  <StatTile label='Missed' value={data.totals.missed} />
               </div>

               {/* The leaderboard stays visible with nothing done yet: everyone starts at zero. */}
               <StatsCard
                  title={data.motivation.leaderboard ? 'Leaderboard' : 'Who did what'}
                  subtitle={
                     data.fairShare !== null && data.totals.points > 0
                        ? `Points, with each person’s fair share (${pct(data.fairShare)} each) marked`
                        : 'Points per person'
                  }
               >
                  <PeopleList stats={data} members={members} />
               </StatsCard>

               <StatsCard title='Activity' subtitle={`Points per ${data.bucket}`}>
                  {data.totals.done === 0 ? (
                     <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <BarChart3 className='size-4' aria-hidden />
                        Nothing done yet in this period. Mark chores as done and they show up here.
                     </p>
                  ) : (
                     <ActivityChart series={data.series} bucket={data.bucket} today={data.today} />
                  )}
               </StatsCard>

               {data.motivation.badges && <Badges stats={data} members={members} />}

               {data.chores.length > 0 && (
                  <StatsCard title='Per chore'>
                     <ChoreTable stats={data} members={members} />
                  </StatsCard>
               )}
            </div>
         )}
      </div>
   )
}

const MEDALS = ['bg-amber-400/25', 'bg-slate-400/25', 'bg-orange-700/20']

/** Meter list: name, points bar (fair share marked), figures; ranked (everyone, zeros too) when the leaderboard is on. */
function PeopleList({ stats, members }: { stats: Stats; members: Member[] }) {
   const leaderboard = stats.motivation.leaderboard
   const rows = leaderboard ? stats.members : stats.members.filter((m) => m.assigned > 0 || m.done > 0 || m.skipped > 0)
   const byName = (a: MemberStats, b: MemberStats) =>
      (members.find((x) => x.id === a.memberId)?.fname ?? '').localeCompare(members.find((x) => x.id === b.memberId)?.fname ?? '')
   const sorted = [...rows].sort(leaderboard ? (a, b) => b.points - a.points || byName(a, b) : byName)
   const fairPoints = stats.fairShare !== null && stats.totals.points > 0 ? stats.fairShare * stats.totals.points : null
   const max = Math.max(...rows.map((m) => m.points), fairPoints ?? 0, 1)

   if (!rows.length) return <p className='text-sm text-muted-foreground'>No chores assigned or done in this period.</p>
   return (
      <ol className='space-y-4'>
         {sorted.map((m, i) => {
            const member = members.find((x) => x.id === m.memberId)
            const rank = leaderboard && m.points > 0 ? i + 1 : null
            return (
               // Fixed side columns: every bar gets the same length, so they compare on one scale.
               <li key={m.memberId} className='grid grid-cols-1 items-center gap-x-4 gap-y-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_15rem]'>
                  <span className='flex min-w-0 items-center gap-2'>
                     {leaderboard && (
                        <span
                           className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold', rank && rank <= 3 ? MEDALS[rank - 1] : 'text-muted-foreground')}
                           aria-label={rank ? `Rank ${rank}` : 'Not ranked yet'}
                        >
                           {rank ?? '–'}
                        </span>
                     )}
                     <Person member={member} />
                  </span>
                  <span className='relative block h-3 rounded-full bg-muted' aria-hidden>
                     <span className='absolute inset-y-0 left-0 rounded-full bg-chart-1' style={{ width: `${(m.points / max) * 100}%` }} />
                     {fairPoints !== null && (
                        <span
                           className='absolute -inset-y-1 w-0.5 rounded-full bg-foreground'
                           style={{ left: `calc(${(fairPoints / max) * 100}% - 1px)` }}
                           title='Fair share'
                        />
                     )}
                  </span>
                  <span className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums'>
                     <span className='font-semibold'>{m.points} pts</span>
                     <span className='text-muted-foreground'>
                        {m.done} done{m.missed ? ` · ${m.missed} missed` : ''}
                        {m.share !== null ? ` · ${pct(m.share)}` : ''}
                     </span>
                     {m.streak && m.streak.current > 0 && (
                        <span className='flex items-center gap-1' title={`Best streak: ${m.streak.best} days`}>
                           <Flame className='size-3.5 text-orange-500' aria-hidden />
                           {m.streak.current}-day streak
                        </span>
                     )}
                  </span>
               </li>
            )
         })}
      </ol>
   )
}

/** Who has which badge, then all badges with your own progress. */
function Badges({ stats, members }: { stats: Stats; members: Member[] }) {
   const me = members.find((m) => m.isMe)
   const mine = stats.members.find((m) => m.memberId === me?.id)
   const holders = stats.members.filter((m) => m.badges?.length)
   return (
      <StatsCard title='Badges' subtitle='Earned over all time'>
         {holders.length ? (
            <ul className='space-y-3'>
               {holders.map((m) => (
                  <li key={m.memberId} className='flex flex-wrap items-center gap-2'>
                     <span className='w-36'>
                        <Person member={members.find((x) => x.id === m.memberId)} />
                     </span>
                     {m.badges?.map((b) => {
                        const def = stats.badgeCatalog.find((d) => d.id === b.id)
                        const Icon = BADGE_ICONS[def?.icon ?? ''] ?? Award
                        return (
                           <span key={b.id} title={def?.description} className='flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium'>
                              <Icon className='size-3.5 text-primary' aria-hidden />
                              {def?.name ?? b.id}
                           </span>
                        )
                     })}
                  </li>
               ))}
            </ul>
         ) : (
            <p className='text-sm text-muted-foreground'>No badges yet: the first chore earns one.</p>
         )}
         {mine?.progress && (
            <div className='mt-6 space-y-3'>
               <h3 className='text-sm font-medium'>Your progress</h3>
               <BadgeGrid catalog={stats.badgeCatalog} progress={mine.progress} earned={mine.badges ?? []} />
            </div>
         )}
      </StatsCard>
   )
}

function ChoreTable({ stats, members }: { stats: Stats; members: Member[] }) {
   return (
      <div className='overflow-x-auto'>
         <table className='w-full min-w-md text-left text-sm'>
            <thead className='text-muted-foreground'>
               <tr>
                  <th className='py-2 font-medium'>Chore</th>
                  <th className='py-2 text-right font-medium'>Done</th>
                  <th className='py-2 text-right font-medium'>Skipped</th>
                  <th className='py-2 text-right font-medium'>Missed</th>
                  <th className='py-2 ps-6 font-medium'>Mostly by</th>
               </tr>
            </thead>
            <tbody className='tabular-nums'>
               {stats.chores.map((c) => (
                  <tr key={c.itemId} className='border-t'>
                     <td className='py-2 font-medium'>{c.title}</td>
                     <td className='py-2 text-right'>{c.done}</td>
                     <td className='py-2 text-right'>{c.skipped}</td>
                     <td className='py-2 text-right'>{c.missed}</td>
                     <td className='py-2 ps-6'>
                        {c.topMemberId ? <Person member={members.find((m) => m.id === c.topMemberId)} /> : <span className='text-muted-foreground'>–</span>}
                     </td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
   )
}
