import { Button } from './button'
import { UserPlus } from 'lucide-react'

import { cn } from '@/lib/utils'
type AddMemberButtonProps = {
   onClick?: () => void
}
const AddMemberButton = ({ onClick }: AddMemberButtonProps) => {

   return (
      <Button className={cn("bg-theme", " rounded-lg")} onClick={onClick}>
         <UserPlus />{"Invite member"}
      </Button>
   )
}

export default AddMemberButton