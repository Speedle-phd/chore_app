import { useMemo, useState } from 'react'
import { ArrowLeft, Cake, Check, CircleSlash, PartyPopper, RefreshCw, Repeat, UserX, WifiOff } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Temporal } from 'temporal-polyfill'
import { apiError } from '@/api/client'
import EmptyState from '@/components/EmptyState'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCalendarItems, useChoreAgenda, type CalendarInstance, type ChoreInfo } from '@/features/calendar/calendarApi'
import { ChangeOccurrenceDialog } from '@/features/calendar/ChangeOccurrenceDialog'
import { ItemDialog } from '@/features/calendar/ItemDialog'
import { OccurrenceDialog } from '@/features/calendar/OccurrenceDialog'
import { describeRepeat } from '@/features/calendar/recurrence'
import { viewerTimeZone } from '@/features/calendar/time'
import { ChoreCard } from '@/features/chores/ChoreCard'
import { dayLabel } from '@/features/chores/format'
import { formatBirthday } from '@/features/households/birthday'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { canDeleteCalendarItem, ROLE_LABEL } from '@/features/households/permissions'
import { ActivityChart } from '@/features/stats/ActivityChart'
import { ordinal, pct } from '@/features/stats/format'
import { BadgeGrid, StatsCard, StatTile } from '@/features/stats/parts'
import { PeriodPicker } from '@/features/stats/PeriodPicker'
import { periodRange, type PeriodId } from '@/features/stats/periods'
import { useMemberStats } from '@/features/stats/statsApi'
import { MemberRewards } from '@/features/rewards/MemberRewards'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'

type ChoreInstance = CalendarInstance & { chore: ChoreInfo }
/** Due chores shown before "Show all": a daily chore alone fills the next 7 days. App choice. */
const DUE_PREVIEW = 5

/** /members/:memberId — one person: figures, badges, their chores and what they did lately. */
const MemberOverview = () => {
   const { memberId = '' } = useParams()
   const household = useHousehold()
   const members = useMembers(household.id)
   const memberList = useMemo(() => members.data ?? [], [members.data])
   const member = memberList.find((m) => m.id === memberId)
   const me = memberList.find((m) => m.isMe)

   const [period, setPeriod] = useState<PeriodId>('month')
   const today = Temporal.Now.plainDateISO().toString()
   // Only once the member is known: an unknown id shows "not found" instead of retrying a 404.
   const stats = useMemberStats(household.id, memberId, periodRange(period, today), Boolean(member))
   const agenda = useChoreAgenda(household.id)
   const library = useCalendarItems(household.id, 'chore')
   const zone = viewerTimeZone()

   const [clicked, setSelected] = useState<CalendarInstance | null>(null)
   const [changing, setChanging] = useState<CalendarInstance | null>(null)
   const [editingId, setEditingId] = useState<string | null>(null)
   const [allDue, setAllDue] = useState(false)
   const canDelete = (createdBy: string) => canDeleteCalendarItem(household.role, createdBy === me?.id)

   const theirs = (list: CalendarInstance[]) =>
      list.filter((i): i is ChoreInstance => i.chore !== null && i.memberIds.includes(memberId))
   const data = agenda.data
   const due = data ? [...theirs(data.overdue), ...theirs(data.today), ...theirs(data.upcoming)] : []
   // The open dialog follows the agenda (done/undo, live changes).
   const selected = clicked && (due.find((i) => i.id === clicked.id) ?? clicked)
   const series = (library.data ?? []).filter((i) => !i.archivedAt && i.memberIds.includes(memberId))

   if (members.isPending) return <div className='h-40 animate-pulse rounded-2xl bg-muted' aria-busy='true' aria-label='Loading' />
   if (!member) {
      return (
         <EmptyState Icon={UserX} title='Member not found' description='They may have left the household.'>
            <Link to='/members' className='inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline'>
               <ArrowLeft className='size-4' aria-hidden />
               Back to Members
            </Link>
         </EmptyState>
      )
   }

   const s = stats.data
   const birthday = formatBirthday(member.birthday)
   return (
      <>
         <Link
            to='/members'
            className='mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50'
         >
            <ArrowLeft className='size-4' aria-hidden />
            Members
         </Link>

         <header className='mb-8 flex flex-wrap items-center gap-4'>
            <Avatar className='size-16'>
               <AvatarImage src={avatarSrc(member)} alt='' />
               <AvatarFallback className='bg-primary/15 text-lg font-medium text-foreground'>{initials(member)}</AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
               <h1 className='text-2xl font-semibold sm:text-3xl'>{member.fullName}</h1>
               <p className='mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                  <Badge variant='secondary'>{ROLE_LABEL[member.role]}</Badge>
                  {member.isMe && <Badge variant='outline'>You</Badge>}
                  {member.kind === 'profile' && <Badge variant='outline'>No login</Badge>}
                  {birthday && (
                     <span className='flex items-center gap-1'>
                        <Cake className='size-3.5' aria-hidden />
                        {birthday}
                     </span>
                  )}
               </p>
            </div>
         </header>

         <div className='space-y-8'>
            <PeriodPicker value={period} onChange={setPeriod} />

            {stats.isPending ? (
               <div className='grid grid-cols-2 gap-3 md:grid-cols-4' aria-busy='true' aria-label='Loading statistics'>
                  {[0, 1, 2, 3].map((i) => (
                     <div key={i} className='h-24 animate-pulse rounded-xl bg-muted' />
                  ))}
               </div>
            ) : stats.isError || !s ? (
               <EmptyState Icon={WifiOff} title='Couldn’t load statistics' description={apiError(stats.error).message}>
                  <Button variant='outline' onClick={() => void stats.refetch()}>
                     <RefreshCw />
                     Try again
                  </Button>
               </EmptyState>
            ) : (
               <div className={cn('space-y-8 transition-opacity', stats.isPlaceholderData && 'opacity-60')} aria-busy={stats.isFetching}>
                  <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
                     <StatTile
                        label='Points'
                        value={s.member.points}
                        hint={s.rank ? `${ordinal(s.rank)} of ${s.ranked}` : s.motivation.leaderboard ? 'Not ranked yet' : undefined}
                     />
                     <StatTile label='Done' value={s.member.done} hint={`${pct(s.member.done ? s.member.onTime / s.member.done : null)} on time`} />
                     {s.member.streak ? (
                        <StatTile
                           label='Streak'
                           value={`${s.member.streak.current} ${s.member.streak.current === 1 ? 'day' : 'days'}`}
                           hint={`Best: ${s.member.streak.best}`}
                        />
                     ) : (
                        <StatTile label='Skipped' value={s.member.skipped} />
                     )}
                     <StatTile label='Missed' value={s.member.missed} />
                  </div>

                  <StatsCard title='Activity' subtitle={`${member.fname}’s points per ${s.bucket}`}>
                     {s.member.done === 0 ? (
                        <p className='text-sm text-muted-foreground'>Nothing done in this period yet.</p>
                     ) : (
                        <ActivityChart series={s.series} bucket={s.bucket} today={s.today} />
                     )}
                  </StatsCard>

                  {s.member.progress && (
                     <StatsCard title='Badges' subtitle='Earned over all time; the rest show how close they are'>
                        <BadgeGrid catalog={s.badgeCatalog} progress={s.member.progress} earned={s.member.badges ?? []} />
                     </StatsCard>
                  )}
               </div>
            )}

            <MemberRewards household={household} member={member} />

            <StatsCard title='Chores due' subtitle='Overdue, today and the next 7 days'>
               {agenda.isPending ? (
                  <div className='h-16 animate-pulse rounded-xl bg-muted' />
               ) : due.length === 0 ? (
                  <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                     <PartyPopper className='size-4' aria-hidden />
                     Nothing due for {member.fname}.
                  </p>
               ) : (
                  <>
                  <ul className='space-y-2'>
                     {(allDue ? due : due.slice(0, DUE_PREVIEW)).map((i) => (
                        <ChoreCard
                           key={i.id}
                           householdId={household.id}
                           instance={i}
                           members={memberList}
                           role={household.role}
                           today={data?.date ?? ''}
                           zone={zone}
                           onOpen={setSelected}
                        />
                     ))}
                  </ul>
                  {due.length > DUE_PREVIEW && (
                     <Button variant='ghost' size='sm' className='mt-3' aria-expanded={allDue} onClick={() => setAllDue((v) => !v)}>
                        {allDue ? 'Show fewer' : `Show all ${due.length}`}
                     </Button>
                  )}
                  </>
               )}
            </StatsCard>

            <div className='grid gap-8 lg:grid-cols-2'>
               <StatsCard title='Their chores'>
                  {series.length === 0 ? (
                     <p className='text-sm text-muted-foreground'>{member.fname} isn’t part of any chore.</p>
                  ) : (
                     <ul className='divide-y text-sm'>
                        {series.map((i) => (
                           <li key={i.id} className='flex items-center justify-between gap-3 py-2'>
                              <span className='truncate font-medium'>{i.title}</span>
                              <span className='flex shrink-0 items-center gap-1 text-muted-foreground'>
                                 {(i.rrule || i.afterDays) && <Repeat className='size-3.5' aria-hidden />}
                                 {describeRepeat(i.rrule, i.timezone, i.afterDays)}
                              </span>
                           </li>
                        ))}
                     </ul>
                  )}
               </StatsCard>

               <StatsCard title='Lately'>
                  {!s?.recent.length ? (
                     <p className='text-sm text-muted-foreground'>Nothing done or skipped yet.</p>
                  ) : (
                     <ul className='space-y-2 text-sm'>
                        {s.recent.map((c) => (
                           <li key={`${c.itemId}-${c.at}`} className='flex items-start gap-2'>
                              {c.status === 'done' ? (
                                 <Check className='mt-0.5 size-4 shrink-0 text-primary' aria-label='Done' />
                              ) : (
                                 <CircleSlash className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-label='Skipped' />
                              )}
                              <span className='min-w-0 flex-1 truncate'>{c.title}</span>
                              <span className='shrink-0 text-muted-foreground'>{dayLabel(c.date, today)}</span>
                           </li>
                        ))}
                     </ul>
                  )}
               </StatsCard>
            </div>
         </div>

         <OccurrenceDialog
            householdId={household.id}
            instance={selected}
            members={memberList}
            role={household.role}
            canDelete={canDelete}
            onClose={() => setSelected(null)}
            onEdit={(itemId) => {
               setSelected(null)
               setEditingId(itemId)
            }}
            onChange={(instance) => {
               setSelected(null)
               setChanging(instance)
            }}
         />
         <ItemDialog
            householdId={household.id}
            members={memberList}
            itemId={editingId}
            draft={null}
            canDelete={canDelete}
            onClose={() => setEditingId(null)}
         />
         <ChangeOccurrenceDialog householdId={household.id} instance={changing} members={memberList} onClose={() => setChanging(null)} />
      </>
   )
}

export default MemberOverview
