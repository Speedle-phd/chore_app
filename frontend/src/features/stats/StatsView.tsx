import { useState } from 'react'
import {
   Award,
   BarChart3,
   Clock,
   Dumbbell,
   Flame,
   FlameKindling,
   HandHeart,
   Lock,
   Medal,
   RefreshCw,
   Sparkles,
   Trophy,
   WifiOff,
   type LucideIcon,
} from 'lucide-react'
import { Temporal } from 'temporal-polyfill'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Member } from '@/features/households/householdsApi'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'
import { pressedClass } from '@/features/calendar/styles'
import { ActivityChart } from './ActivityChart'
import { PERIODS, periodRange, type PeriodId } from './periods'
import { useStats, type MemberStats, type Stats } from './statsApi'

const BADGE_ICONS: Record<string, LucideIcon> = {
   sparkles: Sparkles,
   medal: Medal,
   award: Award,
   trophy: Trophy,
   clock: Clock,
   dumbbell: Dumbbell,
   'hand-heart': HandHeart,
   flame: Flame,
   'flame-kindling': FlameKindling,
}
const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`)

/** Chores → Stats: what got done, by whom, and (if switched on) leaderboard, streaks and badges. */
export function StatsView({ householdId, members }: { householdId: string; members: Member[] }) {
   const [period, setPeriod] = useState<PeriodId>('week')
   const today = Temporal.Now.plainDateISO().toString()
   const stats = useStats(householdId, periodRange(period, today))
   const data = stats.data

   return (
      <div className='space-y-8'>
         {/* Filters: one row above everything they scope. */}
         <ToggleGroup
            aria-label='Period'
            variant='outline'
            spacing={1}
            className='flex-wrap'
            value={[period]}
            onValueChange={(v) => v[0] && setPeriod(v[0] as PeriodId)}
         >
            {PERIODS.map((p) => (
               <ToggleGroupItem key={p.id} value={p.id} className={cn('h-8 px-3', pressedClass)}>
                  {p.label}
               </ToggleGroupItem>
            ))}
         </ToggleGroup>

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

               {data.totals.done === 0 && data.totals.missed === 0 ? (
                  <EmptyState Icon={BarChart3} title='Nothing done yet in this period' description='Mark chores as done and they show up here.' />
               ) : (
                  <>
                     <Card title='Activity' subtitle={`Points per ${data.bucket}`}>
                        <ActivityChart series={data.series} bucket={data.bucket} today={data.today} />
                     </Card>
                     <Card
                        title={data.motivation.leaderboard ? 'Leaderboard' : 'Who did what'}
                        subtitle={
                           data.fairShare !== null
                              ? `Points, with each person’s fair share (${pct(data.fairShare)} each) marked`
                              : 'Points per person'
                        }
                     >
                        <PeopleList stats={data} members={members} />
                     </Card>
                  </>
               )}

               {data.motivation.badges && <Badges stats={data} members={members} />}

               {data.chores.length > 0 && (
                  <Card title='Per chore'>
                     <ChoreTable stats={data} members={members} />
                  </Card>
               )}
            </div>
         )}
      </div>
   )
}

function StatTile({ label, value }: { label: string; value: number | string }) {
   return (
      <div className='rounded-xl border bg-card p-4'>
         <p className='text-sm text-muted-foreground'>{label}</p>
         <p className='mt-1 text-2xl font-semibold'>{value}</p>
      </div>
   )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
   return (
      <section className='rounded-2xl border bg-card p-5' aria-label={title}>
         <h2 className='font-semibold'>{title}</h2>
         {subtitle && <p className='mb-4 text-sm text-muted-foreground'>{subtitle}</p>}
         {!subtitle && <div className='mb-4' />}
         {children}
      </section>
   )
}

function Person({ member }: { member: Member | undefined }) {
   return (
      <span className='flex min-w-0 items-center gap-2'>
         <Avatar className='size-7' aria-hidden>
            {member && <AvatarImage src={avatarSrc(member)} alt='' />}
            <AvatarFallback className='bg-muted text-[0.625rem] font-semibold text-foreground'>{member ? initials(member) : '?'}</AvatarFallback>
         </Avatar>
         <span className='truncate font-medium'>{member?.fname ?? 'Former member'}</span>
      </span>
   )
}

const MEDALS = ['bg-amber-400/25', 'bg-slate-400/25', 'bg-orange-700/20']

/** Meter list: name, points bar (fair share marked), figures; ranked when the leaderboard is on. */
function PeopleList({ stats, members }: { stats: Stats; members: Member[] }) {
   const rows = stats.members.filter((m) => m.assigned > 0 || m.done > 0 || m.skipped > 0)
   const byName = (a: MemberStats, b: MemberStats) =>
      (members.find((x) => x.id === a.memberId)?.fname ?? '').localeCompare(members.find((x) => x.id === b.memberId)?.fname ?? '')
   const sorted = [...rows].sort(stats.motivation.leaderboard ? (a, b) => b.points - a.points || byName(a, b) : byName)
   const max = Math.max(...rows.map((m) => m.points), stats.fairShare !== null ? stats.fairShare * stats.totals.points : 0, 1)
   const fairPoints = stats.fairShare !== null ? stats.fairShare * stats.totals.points : null

   if (!rows.length) return <p className='text-sm text-muted-foreground'>No chores assigned or done in this period.</p>
   return (
      <ol className='space-y-4'>
         {sorted.map((m, i) => {
            const member = members.find((x) => x.id === m.memberId)
            const rank = stats.motivation.leaderboard && m.points > 0 ? i + 1 : null
            return (
               // Fixed side columns: every bar gets the same length, so they compare on one scale.
               <li key={m.memberId} className='grid grid-cols-1 items-center gap-x-4 gap-y-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_15rem]'>
                  <span className='flex min-w-0 items-center gap-2'>
                     {stats.motivation.leaderboard && (
                        <span
                           className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold', rank && rank <= 3 ? MEDALS[rank - 1] : 'text-muted-foreground')}
                           aria-label={rank ? `Rank ${rank}` : 'Not ranked'}
                        >
                           {rank ?? '–'}
                        </span>
                     )}
                     <Person member={member} />
                  </span>
                  <span className='relative block h-3 rounded-full bg-muted' aria-hidden>
                     <span className='absolute inset-y-0 left-0 rounded-full bg-(--chart-1)' style={{ width: `${(m.points / max) * 100}%` }} />
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
                     {m.streak && m.streak.current > 1 && (
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

function Badges({ stats, members }: { stats: Stats; members: Member[] }) {
   const meId = members.find((m) => m.isMe)?.id
   const mine = new Set(stats.members.find((m) => m.memberId === meId)?.badges?.map((b) => b.id))
   const holders = stats.members.filter((m) => m.badges?.length)
   return (
      <Card title='Badges' subtitle='Earned over all time'>
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
         <details className='mt-4 text-sm'>
            <summary className='cursor-pointer text-muted-foreground hover:text-foreground'>All badges</summary>
            <ul className='mt-3 grid gap-2 sm:grid-cols-2'>
               {stats.badgeCatalog.map((d) => {
                  const Icon = BADGE_ICONS[d.icon] ?? Award
                  const have = mine.has(d.id)
                  return (
                     <li key={d.id} className={cn('flex items-start gap-2 rounded-lg border p-2.5', !have && 'bg-muted/30')}>
                        {have ? <Icon className='mt-0.5 size-4 text-primary' aria-hidden /> : <Lock className='mt-0.5 size-4 text-muted-foreground' aria-hidden />}
                        <span>
                           <span className='block font-medium'>
                              {d.name}
                              {have && <span className='sr-only'> (yours)</span>}
                           </span>
                           <span className='text-muted-foreground'>{d.description}</span>
                        </span>
                     </li>
                  )
               })}
            </ul>
         </details>
      </Card>
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
