import { TrashIcon } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

type DeleteButtonProps = {
  onClick?: () => void
  className?: string
}

const DeleteButton = ({ onClick, className }: DeleteButtonProps) => {
  return (
    <Button onClick={onClick} className={cn(className)}>
      <TrashIcon />Delete
    </Button>
  )
}

export default DeleteButton