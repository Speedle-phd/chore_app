
import { EditIcon } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

type EditButtonProps = {
  onClick?: () => void
  className?: string
}

const EditButton = ({ onClick, className }: EditButtonProps) => {
  return (
    <Button onClick={onClick} className={cn(className)}>
      <EditIcon />Edit
    </Button>
  )
}

export default EditButton
