import type { Member } from '@/features/memberStore'
import { Card, CardContent, CardHeader } from './ui/card'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Mail, ShieldCog, User } from 'lucide-react'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import EditButton from './EditButton'
import DeleteButton from './DeleteButton'

import AddMemberButton from './ui/AddMemberButton'

type MemberCardProps = {
   member?: Member
}
const MemberCard = ({ member }: MemberCardProps) => {
   const { fullName, fname, lname, email, avatarUrl, handle, role } = member ?? {}
   if (!member) return (
      <Card className={cn('border-2 border-dashed border-theme')}>
         <CardContent className='flex flex-col items-center gap-2'>
            <div
               className={cn('bg-theme', 'rounded-full h-12 w-12 flex items-center justify-center select-none')}
            >
               <span className='text-3xl font-medium text-muted'>+</span>
            </div>
            <h3>Growing the Schnuffication?</h3>
            <p className='text-muted-foreground text-center text-xs'>Invite some schnuffis to join the schnuffiliciousness</p>
            <AddMemberButton onClick={() => console.log('Invite member clicked')} />
         </CardContent>
      </Card>
   )
   return (
      <Card className={cn("border-2", "border-theme")}>
         <CardHeader className='flex items-center gap-4'>
            <Avatar size='lg'>
               <AvatarImage src={avatarUrl} />
               <AvatarFallback
                  className={`text-secondary bg-theme`}
               >
                  {(fname?.[0] ?? '') + (lname?.[0] ?? '')}
               </AvatarFallback>
            </Avatar>
            <div>
               <h3>{fullName ?? ''}</h3>
               <p className='text-muted-foreground text-[0.7rem]'>
                  {'@' + (handle ?? '')}
               </p>
            </div>
         </CardHeader>
         <CardContent>
            <div className='flex items-center justify-between gap-2'>
               <div className='flex items-center gap-2'>
                  <Mail size={16} className='text-muted-foreground' />
                  {email ?? ''}
               </div>
               <Badge className={cn('text-xs', 'bg-theme')}>
                  {role === "member" ? <User /> : <ShieldCog />}
                  {(role?.[0].toLocaleUpperCase() ?? '') + (role?.slice(1) ?? '')}
               </Badge>
            </div>
            <Separator className={cn('bg-theme', "my-4")} />
            <div className='flex gap-2'>
               <EditButton className={'bg-theme'} onClick={() => console.log('Edit clicked')} />
               <DeleteButton className={"bg-accent-foreground"} onClick={() => console.log('Delete clicked')} />
            </div>
         </CardContent>
      </Card>
   )
}

export default MemberCard
