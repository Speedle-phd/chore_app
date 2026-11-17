import { Link } from 'react-router-dom'
import { apiError } from '@/api/client'
import type { Household, Member } from '@/features/households/householdsApi'
import { canManage } from '@/features/households/permissions'
import { StatsCard } from '@/features/stats/parts'
import { points, STATUS_LABEL } from './format'
import { useMemberRewards } from './rewardsApi'

/** Member overview: points to spend and latest rewards. Only for the person themselves and managers (server rule). */
export function MemberRewards({ household, member }: { household: Household; member: Member }) {
   const visible = household.motivation.rewards && (member.isMe || canManage(household.role))
   const data = useMemberRewards(household.id, member.id, visible)
   if (!visible) return null
   return (
      <StatsCard title='Rewards' subtitle={member.isMe ? 'Your points to spend' : `${member.fname}’s points to spend`}>
         {data.isPending ? (
            <div className='h-12 animate-pulse rounded-xl bg-muted' />
         ) : data.isError ? (
            <p className='text-sm text-muted-foreground'>Couldn’t load the rewards: {apiError(data.error).message}</p>
         ) : (
            <div className='space-y-3'>
               <p className='text-sm'>
                  <span className='text-2xl font-semibold tabular-nums'>{data.data.balance.available.toLocaleString()}</span>{' '}
                  <span className='text-muted-foreground'>
                     to spend · {points(data.data.balance.earned)} earned · {data.data.balance.spent.toLocaleString()} spent
                  </span>
               </p>
               {data.data.recent.length > 0 && (
                  <ul className='divide-y rounded-xl border text-sm'>
                     {data.data.recent.map((r) => (
                        <li key={r.id} className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'>
                           <span>
                              <span className='font-medium'>{r.title}</span>{' '}
                              <span className='text-muted-foreground tabular-nums'>
                                 · {points(r.cost)} · {new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                              </span>
                           </span>
                           <span className='text-xs text-muted-foreground'>{STATUS_LABEL[r.status]}</span>
                        </li>
                     ))}
                  </ul>
               )}
               <Link to='/chores?tab=rewards' className='inline-block text-sm font-medium text-primary underline-offset-4 hover:underline'>
                  Open rewards
               </Link>
            </div>
         )}
      </StatsCard>
   )
}
