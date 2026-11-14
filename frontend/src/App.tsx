import { Link, useOutletContext } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { NavigationItem } from '@/types/types'
import { useHousehold, useMembers } from '@/features/households/householdsApi'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { avatarSrc, initials } from '@/lib/member'
import ReceivedInvitations from '@/features/invitations/ReceivedInvitations'

function greeting(hour: number) {
   if (hour < 12) return 'Good morning'
   if (hour < 18) return 'Good afternoon'
   return 'Good evening'
}

function App() {
   const { navigationItems } = useOutletContext<{
      navigationItems: NavigationItem[]
   }>()
   const household = useHousehold()
   const members = useMembers(household.id).data ?? []
   const [hour] = useState(() => new Date().getHours())
   const sections = navigationItems.filter((item) => item.href !== '/')

   return (
      <div className='space-y-10'>
         <ReceivedInvitations />
         <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className='relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-10'
         >
            <div
               aria-hidden
               className='pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/15 blur-3xl'
            />
            <p className='text-sm font-medium text-primary'>
               {greeting(hour)}
            </p>
            <h1 className='mt-2 max-w-xl text-3xl font-semibold sm:text-4xl'>
               Welcome home, schnuffis.
            </h1>
            <p className='mt-3 max-w-lg text-muted-foreground'>
               Everything your household needs in one calm place: chores,
               plans, groceries and the people who make it all happen.
            </p>

            {members.length > 0 && (
               <Link
                  to='/members'
                  className='mt-6 inline-flex items-center gap-3 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
               >
                  <span className='flex -space-x-2'>
                     {members.slice(0, 5).map((member) => (
                        <Avatar
                           key={member.id}
                           className='ring-2 ring-card'
                        >
                           <AvatarImage src={avatarSrc(member)} alt='' />
                           <AvatarFallback className='bg-primary text-xs text-primary-foreground'>
                              {initials(member)}
                           </AvatarFallback>
                        </Avatar>
                     ))}
                  </span>
                  <span className='text-sm text-muted-foreground'>
                     {members.length} {members.length === 1 ? 'person' : 'people'} in {household.name}
                  </span>
               </Link>
            )}
         </motion.section>

         <section aria-labelledby='sections-heading'>
            <h2
               id='sections-heading'
               className='mb-4 text-sm font-medium text-muted-foreground'
            >
               Jump back in
            </h2>
            <ul className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
               {sections.map(({ href, label, subtitle, Icon }) => (
                  <li key={href}>
                     <Link
                        to={href}
                        className='group flex h-full items-start gap-4 rounded-2xl border bg-card p-5 transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50'
                     >
                        <span className='grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary'>
                           <Icon className='size-5' />
                        </span>
                        <span className='min-w-0 flex-1'>
                           <span className='block font-medium'>{label}</span>
                           <span className='mt-0.5 block text-sm text-muted-foreground'>
                              {subtitle}
                           </span>
                        </span>
                        <ArrowUpRight className='size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary' />
                     </Link>
                  </li>
               ))}
            </ul>
         </section>
      </div>
   )
}

export default App
