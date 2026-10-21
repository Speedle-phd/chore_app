import { useMembers } from '@/features/memberStore'
import type { NavigationItem } from '@/layout/AppLayout'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import MemberCard from '@/components/MemberCard'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/useDebounce'
const Members = () => {
   const [filter, setFilter] = useState<string>('')

   const debouncedSearchTerm = useDebounce(filter, 500)
   const { navigationItems } = useOutletContext<{
      navigationItems: NavigationItem[]
   }>()
   const { members } = useMembers()
   const membersCount = members.length
   const memberNavigationItem = navigationItems?.find(
      (item) => item.href === '/members',
   )
   return (
      <div>
         <header className='flex justify-between items-center mb-4'>
            <div className='flex items-center gap-4'>
               <div>
                  {memberNavigationItem?.Icon && (
                     <memberNavigationItem.Icon
                        className={cn('text-theme')}
                        size={38}
                     />
                  )}
               </div>
               <div>
                  <h1 className='text-2xl font-bold'>Members</h1>
                  <p className='text-muted-foreground text-xs'>
                     The schnuffis who make this place schnuffelicios
                  </p>
               </div>
            </div>
            <Badge className='bg-theme'>
               {membersCount} {membersCount === 1 ? 'member' : 'members'} joined
            </Badge>
         </header>
         <div className='search-filter my-6'>
            <div className='search-filter my-6 relative'>
               <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
               <Input
                  className='pl-9'
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder='Search members...'
               />
            </div>
         </div>
         <div className='auto-grid'>
            {members
               .filter(
                  (member) =>
                     (member.fullName ?? '')
                        .toLowerCase()
                        .includes(debouncedSearchTerm.toLowerCase()) ||
                     (member.handle ?? '')
                        .toLowerCase()
                        .includes(debouncedSearchTerm.toLowerCase()) ||
                     (member.email ?? '')
                        .toLowerCase()
                        .includes(debouncedSearchTerm.toLowerCase()),
               )
               .map((member) => (
                  <MemberCard key={member._id} member={member} />
               ))}
            <MemberCard key='new' />
         </div>
      </div>
   )
}

export default Members
