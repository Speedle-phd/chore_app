import { Button } from './button'
import { UserPlus } from 'lucide-react'

import { cn } from '@/lib/utils'
type AddMemberButtonProps = {
   onClick?: () => void
}
const AddMemberButton = ({ onClick }: AddMemberButtonProps) => {

   return (
      <div role="button" className={cn("bg-theme hover:opacity-80 flex justify-content align-items p-2 text-primary-foreground", " rounded-lg")} onClick={onClick}>
         <UserPlus size={16}/><span className='ml-2'>Add Member</span>
      </div>
   )
}

export default AddMemberButton