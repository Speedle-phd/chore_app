import { Award, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Member } from '@/features/households/householdsApi'
import { avatarSrc, initials } from '@/lib/member'
import { cn } from '@/lib/utils'
import { BADGE_ICONS } from './format'
import type { BadgeDef, BadgeProgress } from './statsApi'

/** Avatar + first name; links to the member's overview when they still exist. */
export function Person({ member, link = true }: { member: Member | undefined; link?: boolean }) {
   const body = (
      <>
         <Avatar className='size-7' aria-hidden>
            {member && <AvatarImage src={avatarSrc(member)} alt='' />}
            <AvatarFallback className='bg-muted text-[0.625rem] font-semibold text-foreground'>{member ? initials(member) : '?'}</AvatarFallback>
         </Avatar>
         <span className='truncate font-medium'>{member?.fname ?? 'Former member'}</span>
      </>
   )
   return member && link ? (
      <Link
         to={`/members/${member.id}`}
         className='flex min-w-0 items-center gap-2 rounded-md underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50'
      >
         {body}
      </Link>
   ) : (
      <span className='flex min-w-0 items-center gap-2'>{body}</span>
   )
}

export function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
   return (
      <div className='rounded-xl border bg-card p-4'>
         <p className='text-sm text-muted-foreground'>{label}</p>
         <p className='mt-1 text-2xl font-semibold tabular-nums'>{value}</p>
         {hint && <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>}
      </div>
   )
}

export function StatsCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
   return (
      <section className='rounded-2xl border bg-card p-5' aria-label={title}>
         <h2 className='font-semibold'>{title}</h2>
         {subtitle ? <p className='mb-4 text-sm text-muted-foreground'>{subtitle}</p> : <div className='mb-4' />}
         {children}
      </section>
   )
}

/** Every badge: earned ones highlighted (with date), the rest with progress towards the goal. */
export function BadgeGrid({
   catalog,
   progress,
   earned,
}: {
   catalog: BadgeDef[]
   progress: BadgeProgress[]
   earned: { id: string; earnedAt: string }[]
}) {
   return (
      <ul className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
         {catalog.map((d) => {
            const Icon = BADGE_ICONS[d.icon] ?? Award
            const got = earned.find((e) => e.id === d.id)
            const p = progress.find((x) => x.id === d.id)
            return (
               <li key={d.id} className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm', got ? 'border-primary/50' : 'bg-muted/30')}>
                  <span
                     className={cn('grid size-8 shrink-0 place-items-center rounded-full', got ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}
                     aria-hidden
                  >
                     {got ? <Icon className='size-4' /> : <Lock className='size-4' />}
                  </span>
                  <span className='min-w-0 flex-1'>
                     <span className='block font-medium'>
                        {d.name}
                        <span className='sr-only'>{got ? ' (earned)' : ' (not yet)'}</span>
                     </span>
                     <span className='block text-muted-foreground'>{d.description}</span>
                     {got ? (
                        <span className='mt-1 block text-xs text-muted-foreground'>
                           Earned {new Date(got.earnedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                     ) : (
                        p && (
                           <span className='mt-2 flex items-center gap-2 text-xs text-muted-foreground'>
                              <span className='h-1.5 flex-1 rounded-full bg-muted' aria-hidden>
                                 <span className='block h-full rounded-full bg-(--chart-1)' style={{ width: `${(p.value / p.goal) * 100}%` }} />
                              </span>
                              <span className='tabular-nums'>
                                 {p.value} / {p.goal}
                              </span>
                           </span>
                        )
                     )}
                  </span>
               </li>
            )
         })}
      </ul>
   )
}
