import { Inbox, LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLogout, useMe } from './authApi'

const UserMenu = () => {
   const { data: user } = useMe()
   const logout = useLogout()
   const navigate = useNavigate()
   if (!user) return null

   const initials = (user.fname[0] ?? '') + (user.lname[0] ?? '')

   return (
      <DropdownMenu>
         <DropdownMenuTrigger
            // Starts with the visible initials, so voice users can say what they see (WCAG 2.5.3).
            aria-label={`${initials.toUpperCase()}, account menu for ${user.fullName}`}
            className='rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
         >
            <Avatar>
               <AvatarImage src={user.avatarUrl ?? undefined} alt='' />
               <AvatarFallback className='bg-primary text-xs font-medium text-primary-foreground'>
                  {initials.toUpperCase()}
               </AvatarFallback>
            </Avatar>
         </DropdownMenuTrigger>
         <DropdownMenuContent align='end' className='min-w-56'>
            <DropdownMenuGroup>
               <DropdownMenuLabel className='font-normal'>
                  <span className='block truncate text-sm font-medium text-foreground'>
                     {user.fullName}
                  </span>
                  <span className='block truncate text-xs text-muted-foreground'>{user.email}</span>
               </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/account')}>
               <UserRound />
               Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/invitations')}>
               <Inbox />
               Invitations
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
               disabled={logout.isPending}
               onClick={() =>
                  logout.mutate(undefined, {
                     onSuccess: () => navigate('/login', { replace: true }),
                     onError: (error) => toast.error(apiError(error).message),
                  })
               }
            >
               <LogOut />
               Sign out
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   )
}

export default UserMenu
