import { useState } from 'react'
import { formatBirthday } from '@/features/households/birthday'
import { Cake, Crown, LogOut, Mail, MailPlus, ShieldCheck, User, UserCog, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { apiError } from '@/api/client'
import {
   useChangeRole,
   useLeaveHousehold,
   useRemoveMember,
   type Member,
   type Role,
} from '@/features/households/householdsApi'
import { canChangeRoles, canManage, canRemove, ROLE_LABEL } from '@/features/households/permissions'
import ProfileForm from '@/features/households/ProfileForm'
import { useHousehold } from '@/features/households/householdsApi'
import InviteDialog from '@/features/invitations/InviteDialog'
import { avatarSrc, initials } from '@/lib/member'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import DeleteButton from './DeleteButton'
import EditButton from './EditButton'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from './ui/dialog'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuLabel,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuTrigger,
} from './ui/dropdown-menu'

const ROLE_ICON = { owner: Crown, admin: ShieldCheck, member: User } as const

type MemberCardProps = { member: Member; myRole: Role; householdId: string; online?: boolean }

export function AddProfileCard({ householdId }: { householdId: string }) {
   const [open, setOpen] = useState(false)
   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <DialogTrigger
            render={
               <button
                  type='button'
                  className='group flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-6 text-center transition-colors outline-none hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50'
               >
                  <span className='grid size-12 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110'>
                     <UserPlus className='size-5' />
                  </span>
                  <span>
                     <span className='block text-sm font-medium'>Add a profile</span>
                     <span className='mt-0.5 block text-xs text-muted-foreground'>
                        For someone without a login, e.g. a child
                     </span>
                  </span>
               </button>
            }
         />
         <DialogContent className='sm:max-w-md'>
            <DialogHeader>
               <DialogTitle className='text-lg font-semibold'>Add a profile</DialogTitle>
               <DialogDescription>
                  Profiles can be assigned chores but can’t sign in. You can invite them to claim it later.
               </DialogDescription>
            </DialogHeader>
            <ProfileForm
               householdId={householdId}
               onDone={(saved) => {
                  setOpen(false)
                  toast.success(`Added ${saved.fullName}`)
               }}
            />
         </DialogContent>
      </Dialog>
   )
}

const MemberCard = ({ member, myRole, householdId, online = false }: MemberCardProps) => {
   const navigate = useNavigate()
   const household = useHousehold()
   const [editOpen, setEditOpen] = useState(false)
   const [removeOpen, setRemoveOpen] = useState(false)
   const [leaveOpen, setLeaveOpen] = useState(false)
   const changeRole = useChangeRole(householdId)
   const remove = useRemoveMember(householdId)
   const leave = useLeaveHousehold(householdId)

   const isProfile = member.kind === 'profile'
   const RoleIcon = ROLE_ICON[member.role]
   const showEdit = isProfile && canManage(myRole)
   const showRole = !isProfile && canChangeRoles(myRole)
   const showRemove = !member.isMe && canRemove(myRole, member.role)

   return (
      <Card className='group gap-0 rounded-2xl p-0 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 hover:ring-primary/30'>
         <div className='flex flex-1 items-start gap-4 p-5'>
            <span className='relative shrink-0'>
               <Avatar className='size-12'>
                  <AvatarImage src={avatarSrc(member)} alt='' />
                  <AvatarFallback className='bg-primary/15 font-medium text-primary'>{initials(member)}</AvatarFallback>
               </Avatar>
               {/* Accounts only: profiles can't be online. */}
               {member.kind === 'account' && online && (
                  <span
                     className='absolute right-0 bottom-0 size-3.5 rounded-full bg-emerald-500 ring-2 ring-card'
                     title='Online'
                  >
                     <span className='sr-only'>Online</span>
                  </span>
               )}
            </span>
            <div className='min-w-0 flex-1'>
               <h3 className='flex items-center gap-2 font-semibold'>
                  <span className='truncate'>{member.fullName}</span>
                  {member.isMe && (
                     <span className='shrink-0 rounded-full bg-muted px-1.5 text-[0.65rem] font-medium text-muted-foreground'>
                        You
                     </span>
                  )}
               </h3>
               <div className='mt-2 flex flex-wrap gap-1.5'>
                  <Badge variant={member.role === 'member' ? 'secondary' : 'default'}>
                     <RoleIcon />
                     {ROLE_LABEL[member.role]}
                  </Badge>
                  {isProfile && <Badge variant='outline'>No login</Badge>}
               </div>
               {formatBirthday(member.birthday) && (
                  <p className='mt-2 flex items-center gap-1.5 text-sm text-muted-foreground'>
                     <Cake className='size-3.5' aria-hidden />
                     <span className='sr-only'>Birthday:</span>
                     {formatBirthday(member.birthday)}
                  </p>
               )}
            </div>
         </div>

         <div className='flex min-h-13 items-center justify-between gap-2 border-t bg-muted/40 px-5 py-2.5'>
            {member.email ? (
               <a
                  href={`mailto:${member.email}`}
                  className='flex min-w-0 items-center gap-2 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
               >
                  <Mail className='size-3.5 shrink-0' />
                  <span className='truncate'>{member.email}</span>
               </a>
            ) : (
               <span className='text-xs text-muted-foreground'>Managed by admins</span>
            )}

            <div className='flex shrink-0 gap-1'>
               {showEdit && (
                  <Dialog open={editOpen} onOpenChange={setEditOpen}>
                     <DialogTrigger render={<EditButton label={`Edit ${member.fullName}`} />} />
                     <DialogContent className='sm:max-w-md'>
                        <DialogHeader>
                           <DialogTitle className='text-lg font-semibold'>Edit {member.fname}</DialogTitle>
                           <DialogDescription>Change the name or picture of this profile.</DialogDescription>
                        </DialogHeader>
                        <ProfileForm householdId={householdId} profile={member} onDone={() => setEditOpen(false)} />
                     </DialogContent>
                  </Dialog>
               )}

               {showEdit && (
                  <InviteDialog
                     householdId={householdId}
                     householdName={household.name}
                     myRole={myRole}
                     profiles={[member]}
                     claim={member}
                     trigger={
                        <Button
                           size='icon-sm'
                           variant='ghost'
                           aria-label={`Invite someone to take over ${member.fullName}`}
                           title='Invite to claim this profile'
                           className='text-muted-foreground'
                        >
                           <MailPlus />
                        </Button>
                     }
                  />
               )}

               {showRole && (
                  <DropdownMenu>
                     <DropdownMenuTrigger
                        render={
                           <Button
                              size='icon-sm'
                              variant='ghost'
                              aria-label={`Change role of ${member.fullName}`}
                              title='Change role'
                              className='text-muted-foreground'
                           >
                              <UserCog />
                           </Button>
                        }
                     />
                     <DropdownMenuContent align='end' className='min-w-48'>
                        <DropdownMenuGroup>
                           <DropdownMenuLabel>Role</DropdownMenuLabel>
                           <DropdownMenuRadioGroup
                              value={member.role}
                              onValueChange={(role: Role) => {
                                 if (role === member.role) return
                                 changeRole.mutate(
                                    { memberId: member.id, role },
                                    {
                                       onSuccess: () =>
                                          toast.success(`${member.fname} is now ${ROLE_LABEL[role].toLowerCase()}`),
                                       onError: (error) => toast.error(apiError(error).message),
                                    },
                                 )
                              }}
                           >
                              {(['owner', 'admin', 'member'] as const).map((role) => (
                                 <DropdownMenuRadioItem key={role} value={role} closeOnClick>
                                    {ROLE_LABEL[role]}
                                 </DropdownMenuRadioItem>
                              ))}
                           </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                     </DropdownMenuContent>
                  </DropdownMenu>
               )}

               {showRemove && (
                  <ConfirmDeleteDialog
                     open={removeOpen}
                     onOpenChange={setRemoveOpen}
                     trigger={<DeleteButton label={`Remove ${member.fullName}`} />}
                     title={`Remove ${member.fullName}?`}
                     description={
                        isProfile
                           ? 'This profile and its picture will be deleted. This can’t be undone.'
                           : 'They’ll lose access to this household. You can invite them again later.'
                     }
                     confirmLabel='Remove'
                     isPending={remove.isPending}
                     onConfirm={() =>
                        remove.mutate(member.id, {
                           onSuccess: () => setRemoveOpen(false),
                           onError: (error) => toast.error(apiError(error).message),
                        })
                     }
                  />
               )}

               {member.isMe && (
                  <ConfirmDeleteDialog
                     open={leaveOpen}
                     onOpenChange={setLeaveOpen}
                     trigger={
                        <Button size='sm' variant='ghost' className='text-muted-foreground hover:text-destructive'>
                           <LogOut />
                           Leave
                        </Button>
                     }
                     title='Leave this household?'
                     description='You’ll lose access to its chores and members. Someone can invite you again later.'
                     confirmLabel='Leave'
                     isPending={leave.isPending}
                     onConfirm={() =>
                        leave.mutate(undefined, {
                           onSuccess: () => {
                              setLeaveOpen(false)
                              navigate('/', { replace: true })
                           },
                           onError: (error) => toast.error(apiError(error).message),
                        })
                     }
                  />
               )}
            </div>
         </div>
      </Card>
   )
}

export default MemberCard
